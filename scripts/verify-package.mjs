/**
 * Verifica que un paquete desempaquetado de electron-builder trae lo que la app
 * necesita en runtime, y nada de otra arquitectura.
 *
 *     node scripts/verify-package.mjs <directorio> <win32|darwin|linux> <x64|arm64>
 *
 * `<directorio>` es lo que electron-builder deja antes de armar el instalador:
 * `release/win-unpacked`, `release/mac-arm64`, `release/linux-unpacked`. En
 * macOS se le puede pasar el directorio que contiene el `.app` o el `.app`
 * mismo.
 *
 * Existe porque los tres errores que verifica **no los ve ningún otro test**:
 * el E2E corre contra `out/`, no contra el paquete, así que una extensión que no
 * viaja (hallazgo D2), un ripgrep que no se copió o un node-pty de x64 adentro
 * del instalador de arm64 sólo aparecen cuando alguien instala la app. Lo
 * último es el riesgo de construir una arquitectura en un runner de otra: los
 * binarios nativos llegan como `optionalDependencies` y pnpm instala los de la
 * máquina, no los del destino.
 *
 * Lo que pide, en orden:
 *
 * 1. el ejecutable de ripgrep de esa plataforma y arquitectura;
 * 2. el `.node` de node-pty de esa plataforma y arquitectura;
 * 3. `typescript-language-server/lib/cli.mjs`;
 * 4. las dos extensiones de ejemplo en `resources/extensions/`;
 * 5. que **ningún** binario nativo del paquete —se leen las cabeceras ELF, PE
 *    y Mach-O de cada archivo— sea de otra arquitectura o de otro sistema.
 */
import { existsSync, openSync, readdirSync, readSync, closeSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PLATFORMS = ['win32', 'darwin', 'linux'];
const ARCHS = ['x64', 'arm64'];

/** Qué formato de ejecutable usa cada sistema. */
const FORMAT_OF = { win32: 'pe', darwin: 'macho', linux: 'elf' };

/** El código de máquina de cada formato, por arquitectura. */
const MACHINE = {
  elf: { 0x3e: 'x64', 0xb7: 'arm64' },
  pe: { 0x8664: 'x64', 0xaa64: 'arm64', 0x14c: 'ia32' },
  macho: { 0x01000007: 'x64', 0x0100000c: 'arm64' },
};

/**
 * El directorio `resources` del paquete: el de Electron en Windows y Linux, y
 * `Contents/Resources` del `.app` en macOS.
 */
function resourcesDirectory(root, platform) {
  if (platform !== 'darwin') return join(root, 'resources');

  const app = root.endsWith('.app')
    ? root
    : readdirSync(root).find((name) => name.endsWith('.app'));
  if (app === undefined) throw new Error(`No hay ningún .app en ${root}`);

  return join(root.endsWith('.app') ? root : join(root, app), 'Contents', 'Resources');
}

/** Cada archivo debajo de un directorio, recursivamente, sin seguir symlinks. */
function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/** Los primeros bytes de un archivo, o menos si es más corto. */
function head(path, length) {
  const buffer = Buffer.alloc(length);
  const descriptor = openSync(path, 'r');
  try {
    const read = readSync(descriptor, buffer, 0, length, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(descriptor);
  }
}

/** La máquina de un PE: la cabecera está donde dice el offset de `0x3c`. */
function peMachine(bytes) {
  if (bytes.length < 0x40) return undefined;
  const offset = bytes.readUInt32LE(0x3c);
  if (offset + 6 > bytes.length || bytes.toString('latin1', offset, offset + 4) !== 'PE\0\0') {
    return undefined;
  }
  return bytes.readUInt16LE(offset + 4);
}

/** Las máquinas de un Mach-O: una, o varias si es un binario universal. */
function machoMachines(bytes) {
  const magic = bytes.readUInt32BE(0);
  // Universal (`FAT_MAGIC`): big-endian, con la lista de arquitecturas.
  if (magic === 0xcafebabe) {
    const count = bytes.readUInt32BE(4);
    // Java usa el mismo número mágico; un universal real tiene pocas entradas.
    if (count === 0 || count > 8) return undefined;
    return Array.from({ length: count }, (_, index) => bytes.readUInt32BE(8 + index * 20));
  }
  // Mach-O de 64 bits, little-endian en las dos arquitecturas que importan.
  if (bytes.readUInt32LE(0) === 0xfeedfacf) return [bytes.readUInt32LE(4)];
  return undefined;
}

/**
 * El formato y las arquitecturas de un archivo, o `undefined` si no es un
 * binario nativo.
 */
function nativeBinary(path) {
  const bytes = head(path, 4096);
  if (bytes.length < 8) return undefined;

  if (bytes.readUInt32BE(0) === 0x7f454c46) {
    return { format: 'elf', machines: [bytes.readUInt16LE(18)] };
  }
  if (bytes.toString('latin1', 0, 2) === 'MZ') {
    const machine = peMachine(bytes);
    return machine === undefined ? undefined : { format: 'pe', machines: [machine] };
  }
  const machines = machoMachines(bytes);
  return machines === undefined ? undefined : { format: 'macho', machines };
}

/**
 * Los binarios de otra arquitectura que están ahí a propósito, por ruta exacta
 * relativa al paquete y con la arquitectura que se les acepta.
 *
 * `elevate.exe` es el ayudante de elevación que el NSIS de electron-builder
 * copia en todo paquete de Windows. Viene sólo en x86, y Windows lo corre
 * emulado en x64 y en arm64. La app no lo usa —la instalación es per-user y no
 * eleva nunca—, pero electron-builder no tiene opción para no copiarlo.
 */
const EXPECTED_FOREIGN = { win32: { 'resources/elevate.exe': 'ia32' } };

/** El problema de un binario nativo, o `undefined` si es del destino. */
function foreignBinaryProblem(binary, platform, arch, path) {
  if (binary.format !== FORMAT_OF[platform]) {
    return `es ${binary.format.toUpperCase()} en un paquete de ${platform}`;
  }
  const archs = binary.machines.map(
    (machine) => MACHINE[binary.format][machine] ?? `0x${machine.toString(16)}`
  );
  const expected = EXPECTED_FOREIGN[platform]?.[path];
  if (expected !== undefined && archs.length === 1 && archs[0] === expected) return undefined;
  return archs.includes(arch)
    ? undefined
    : `es de ${archs.join('+')} y el paquete es de ${arch}`;
}

/** Los archivos que tienen que estar, relativos a `resources/`. */
function requiredFiles(platform, arch) {
  const unpacked = join('app.asar.unpacked', 'node_modules');
  const rg = platform === 'win32' ? 'rg.exe' : 'rg';
  // En Windows node-pty es ConPTY, y su binario se llama distinto.
  const pty = platform === 'win32' ? 'conpty.node' : 'pty.node';
  return [
    ['ripgrep', join(unpacked, '@vscode', `ripgrep-${platform}-${arch}`, 'bin', rg)],
    ['node-pty', join(unpacked, '@lydell', `node-pty-${platform}-${arch}`, pty)],
    ['servidor de TypeScript', join(unpacked, 'typescript-language-server', 'lib', 'cli.mjs')],
    ['tema Nord', join('extensions', 'theme-nord', 'package.json')],
    ['Word Count', join('extensions', 'word-count', 'dist', 'extension.js')],
  ];
}

/** Lo que falta y lo que sobra, como lista de mensajes. */
function problems(root, platform, arch) {
  const resources = resourcesDirectory(root, platform);
  const found = [];

  for (const [label, file] of requiredFiles(platform, arch)) {
    if (!existsSync(join(resources, file))) found.push(`falta ${label}: resources/${file}`);
  }

  let natives = 0;
  for (const path of walk(root)) {
    const binary = nativeBinary(path);
    if (binary === undefined) continue;
    natives += 1;
    const where = relative(root, path).split(sep).join('/');
    const problem = foreignBinaryProblem(binary, platform, arch, where);
    if (problem !== undefined) found.push(`${where} ${problem}`);
  }

  // Si no se encontró ni el ejecutable de Electron, el lector de cabeceras está
  // roto o el directorio no es un paquete: pasar en verde sería mentir.
  if (natives === 0) found.push(`no se encontró ningún binario nativo en ${root}`);
  return { found, natives };
}

function main([root, platform, arch]) {
  if (root === undefined || !PLATFORMS.includes(platform) || !ARCHS.includes(arch)) {
    console.error(
      'Uso: node scripts/verify-package.mjs <directorio> <win32|darwin|linux> <x64|arm64>'
    );
    return 2;
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`No existe el directorio ${root}`);
    return 2;
  }

  const { found, natives } = problems(root, platform, arch);
  if (found.length > 0) {
    console.error(`El paquete ${platform}-${arch} tiene ${found.length} problema(s):`);
    for (const problem of found) console.error(`  - ${problem}`);
    return 1;
  }

  console.log(
    `Paquete ${platform}-${arch} verificado: ${natives} binarios nativos, todos de ${arch}.`
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
