import { parseAbsolutePath } from '../workspace/absolute-path.js';

/**
 * Genera el id de la próxima sesión.
 *
 * Los ids son correlativos y no se reciclan: si se reusara el id de una sesión
 * cerrada, un evento `terminal:data` en vuelo del proceso viejo se pintaría en
 * la terminal nueva. Es una carrera de milisegundos y por eso es la clase de
 * bug que aparece una vez cada cien cierres y nadie logra reproducir.
 *
 * Se calcula desde los ids existentes y no desde un contador global para que
 * la función sea pura y el supervisor no tenga estado que resetear entre tests.
 *
 * @param existingIds Los ids de las sesiones vivas.
 * @returns Un id que no colisiona con ninguno.
 * @example
 * nextSessionId([]);                       // 'terminal-1'
 * nextSessionId(['terminal-1', 'terminal-4']); // 'terminal-5'
 */
export function nextSessionId(existingIds: readonly string[]): string {
  const highest = existingIds.reduce((maximum, id) => {
    const parsed = Number.parseInt(id.replace('terminal-', ''), 10);

    return Number.isNaN(parsed) ? maximum : Math.max(maximum, parsed);
  }, 0);

  return `terminal-${String(highest + 1)}`;
}

/**
 * Arma el nombre que se muestra en el dropdown de
 * [RF-302](../../../../docs/03-requerimientos-funcionales.md#terminal-integrada).
 *
 * El nombre sale del ejecutable —`powershell.exe` se muestra como
 * `powershell`— y se desambigua con un sufijo cuando ya hay otra igual. Sin el
 * sufijo, tres terminales abiertas son tres entradas idénticas en la lista y
 * el dropdown deja de servir para elegir.
 *
 * Usa `parseAbsolutePath` y no `basename` por la misma razón que
 * [`workspaceDisplayName`](../workspace/workspace-name.ts): `node:path` cambia
 * de semántica según la plataforma, así que una ruta de Windows daría un
 * nombre distinto en el runner de Linux del CI.
 *
 * @param shellPath Ruta absoluta del ejecutable del shell.
 * @param existingNames Nombres ya en uso.
 * @returns Un nombre que no está repetido.
 * @example
 * displayNameFor('C:\\WINDOWS\\system32\\powershell.exe', []); // 'powershell'
 * displayNameFor('/bin/bash', ['bash']);                       // 'bash (2)'
 */
export function displayNameFor(shellPath: string, existingNames: readonly string[]): string {
  const base = parseAbsolutePath(shellPath)?.segments.at(-1) ?? shellPath;
  // Se saca la extensión sin `extname`: sólo la última, y sólo si no es todo
  // el nombre —un `.bashrc` no se llama vacío—.
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  // Un shell sin nombre no debería pasar, pero el fallback evita que el
  // dropdown quede con una entrada vacía si alguna vez pasa.
  const name = stem === '' ? 'terminal' : stem;

  if (!existingNames.includes(name)) return name;

  // Se busca el primer sufijo libre en vez de contar cuántas hay: cerrar la
  // segunda de tres y abrir otra tiene que reusar el (2), no saltar al (4).
  let suffix = 2;

  while (existingNames.includes(`${name} (${String(suffix)})`)) suffix += 1;

  return `${name} (${String(suffix)})`;
}
