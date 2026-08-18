import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleCreateDirectory,
  handleCreateFile,
  handleDelete,
  handleReadDirectory,
  handleReadFile,
  handleRename,
  handleWriteFile,
  registerFsIpcHandlers,
} from './fs.js';

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
  /** Lo que se mandó a la papelera, en orden. */
  trashed: new Array<string>(),
  /** Si la papelera tiene que fallar, para ejercer el caso de RF-003. */
  trashFails: false,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  // La papelera del sistema operativo no se puede ejercer de verdad en un
  // test: `shell.trashItem` mueve a la papelera **del usuario que corre la
  // suite**, y una suite que llena tu papelera es una suite que nadie quiere
  // correr dos veces. Que la ruta que llega acá es la resuelta y no la cruda es
  // lo que este doble sí verifica.
  shell: {
    trashItem: async (path: string): Promise<void> => {
      if (electron.trashFails) throw new Error('la papelera dijo que no');

      electron.trashed.push(path);

      return Promise.resolve();
    },
  },
}));

let workspace: string;

beforeEach(async () => {
  // realpath desde el arranque: el tmpdir de Windows viene con nombres 8.3 y
  // el de macOS es un symlink. Ver el comentario de path-guard.test.ts.
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'pastecode-fs-')));
  electron.trashed = [];
  electron.trashFails = false;
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** Los temporales del guardado atómico se llaman `.<nombre>.<uuid>.tmp`. */
async function leftoverTemporaries(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.endsWith('.tmp'));
}

describe('handleReadFile', () => {
  it('lee un archivo dentro del workspace', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'const x = 1;\n', 'utf8');

    const result = await handleReadFile({ path }, workspace);

    expect(result.content).toBe('const x = 1;\n');
    expect(result.mtimeMs).toBeGreaterThan(0);
  });

  it('lee un archivo vacío sin confundirlo con binario', async () => {
    const path = join(workspace, 'vacio.txt');
    await writeFile(path, '', 'utf8');

    await expect(handleReadFile({ path }, workspace)).resolves.toMatchObject({ content: '' });
  });

  it('preserva los acentos, que es lo mínimo para un editor en español', async () => {
    const path = join(workspace, 'ñ.txt');
    await writeFile(path, 'árbol de código — ñandú', 'utf8');

    const result = await handleReadFile({ path }, workspace);

    expect(result.content).toBe('árbol de código — ñandú');
  });

  it('rechaza path traversal fuera del workspace', async () => {
    const attempt = handleReadFile({ path: join(workspace, '..', 'secreto.txt') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('rechaza un archivo binario', async () => {
    const path = join(workspace, 'logo.png');
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]));

    await expect(handleReadFile({ path }, workspace)).rejects.toMatchObject({
      code: 'BINARY_FILE_UNSUPPORTED',
    });
  });

  it('acepta un archivo de texto con un byte nulo más allá de los primeros 8KB', async () => {
    // La heurística mira sólo los primeros 8KB, igual que Git. Es una decisión
    // consciente: recorrer 50MB para decidir si se puede abrir sería peor.
    const path = join(workspace, 'grande.txt');
    await writeFile(path, Buffer.concat([Buffer.from('a'.repeat(9000)), Buffer.from([0])]));

    await expect(handleReadFile({ path }, workspace)).resolves.toBeDefined();
  });

  it('rechaza un archivo de más de 50MB antes de intentar leerlo', async () => {
    const path = join(workspace, 'dump.sql');
    const handle = await open(path, 'w');
    // Sparse: reserva el tamaño sin escribir 51MB de verdad. El chequeo de
    // tamaño corre antes que el de binario, así que gana FILE_TOO_LARGE aunque
    // el contenido sean todos bytes nulos.
    await handle.truncate(51 * 1024 * 1024);
    await handle.close();

    await expect(handleReadFile({ path }, workspace)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });

  it('rechaza un archivo que no existe', async () => {
    const attempt = handleReadFile({ path: join(workspace, 'fantasma.ts') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'FILE_ACCESS_DENIED' });
  });
});

describe('handleWriteFile', () => {
  it('escribe un archivo nuevo y devuelve su mtime', async () => {
    const path = join(workspace, 'nuevo.ts');

    const result = await handleWriteFile({ path, content: 'hola' }, workspace);

    expect(await readFile(path, 'utf8')).toBe('hola');
    expect(result.mtimeMs).toBe((await stat(path)).mtimeMs);
  });

  it('sobrescribe un archivo existente', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'viejo', 'utf8');

    await handleWriteFile({ path, content: 'nuevo' }, workspace);

    expect(await readFile(path, 'utf8')).toBe('nuevo');
  });

  it('no deja temporales tras un guardado exitoso', async () => {
    const path = join(workspace, 'a.ts');

    await handleWriteFile({ path, content: 'hola' }, workspace);

    expect(await leftoverTemporaries(workspace)).toEqual([]);
  });

  it('rechaza path traversal fuera del workspace', async () => {
    const attempt = handleWriteFile(
      { path: join(workspace, '..', 'secreto.txt'), content: 'x' },
      workspace
    );

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('escribe cuando el expectedMtimeMs coincide con el del disco', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'viejo', 'utf8');
    const { mtimeMs } = await stat(path);

    await handleWriteFile({ path, content: 'nuevo', expectedMtimeMs: mtimeMs }, workspace);

    expect(await readFile(path, 'utf8')).toBe('nuevo');
  });

  it('rechaza con STALE_FILE cuando el archivo cambió en disco', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'viejo', 'utf8');

    const attempt = handleWriteFile(
      { path, content: 'nuevo', expectedMtimeMs: 1_700_000_000_000 },
      workspace
    );

    await expect(attempt).rejects.toMatchObject({ code: 'STALE_FILE' });
    expect(await readFile(path, 'utf8')).toBe('viejo');
  });

  it('recrea el archivo si lo borraron por afuera, en vez de tratarlo como conflicto', async () => {
    // Quien apretó Ctrl+S espera que su texto quede guardado. Que el archivo
    // ya no esté no es un conflicto de contenido: no hay nada con qué chocar.
    const path = join(workspace, 'a.ts');

    await handleWriteFile({ path, content: 'nuevo', expectedMtimeMs: 1 }, workspace);

    expect(await readFile(path, 'utf8')).toBe('nuevo');
  });

  it('no deja el temporal cuando el rename falla', async () => {
    // El destino es un directorio, así que el rename no puede completarse.
    // Es el equivalente portable del EBUSY que da Windows cuando el archivo
    // está abierto en otro programa.
    const path = join(workspace, 'ocupado');
    await mkdir(path);

    await expect(handleWriteFile({ path, content: 'x' }, workspace)).rejects.toMatchObject({
      code: 'FILE_ACCESS_DENIED',
    });
    expect(await leftoverTemporaries(workspace)).toEqual([]);
  });

  it('escribe en un subdirectorio existente del workspace', async () => {
    await mkdir(join(workspace, 'src'));
    const path = join(workspace, 'src', 'index.ts');

    await handleWriteFile({ path, content: 'export {};' }, workspace);

    expect(await readFile(path, 'utf8')).toBe('export {};');
  });
});

describe('handleReadDirectory', () => {
  it('lista un nivel con las carpetas primero y en orden alfabético', async () => {
    await mkdir(join(workspace, 'src'));
    await mkdir(join(workspace, 'docs'));
    await writeFile(join(workspace, 'b.ts'), '', 'utf8');
    await writeFile(join(workspace, 'a.ts'), '', 'utf8');

    const { entries } = await handleReadDirectory({ path: workspace }, workspace);

    expect(entries.map((item) => item.name)).toEqual(['docs', 'src', 'a.ts', 'b.ts']);
  });

  it('marca cuáles entradas son directorios y devuelve rutas absolutas', async () => {
    await mkdir(join(workspace, 'src'));

    const { entries } = await handleReadDirectory({ path: workspace }, workspace);

    expect(entries).toEqual([{ name: 'src', path: join(workspace, 'src'), isDirectory: true }]);
  });

  it('no lista recursivamente: los hijos se piden al expandir', async () => {
    await mkdir(join(workspace, 'src', 'nested'), { recursive: true });
    await writeFile(join(workspace, 'src', 'nested', 'hondo.ts'), '', 'utf8');

    const { entries } = await handleReadDirectory({ path: workspace }, workspace);

    expect(entries.map((item) => item.name)).toEqual(['src']);
  });

  it.each(['node_modules', '.git', 'dist'])('excluye %s del listado', async (excluded) => {
    await mkdir(join(workspace, excluded));
    await writeFile(join(workspace, 'a.ts'), '', 'utf8');

    const { entries } = await handleReadDirectory({ path: workspace }, workspace);

    expect(entries.map((item) => item.name)).toEqual(['a.ts']);
  });

  it('excluye node_modules también en un subdirectorio', async () => {
    await mkdir(join(workspace, 'packages', 'core', 'node_modules'), { recursive: true });
    await mkdir(join(workspace, 'packages', 'core', 'src'), { recursive: true });

    const { entries } = await handleReadDirectory(
      { path: join(workspace, 'packages', 'core') },
      workspace
    );

    expect(entries.map((item) => item.name)).toEqual(['src']);
  });

  it('devuelve una lista vacía para una carpeta vacía', async () => {
    await mkdir(join(workspace, 'vacia'));

    const { entries } = await handleReadDirectory(
      { path: join(workspace, 'vacia') },
      workspace
    );

    expect(entries).toEqual([]);
  });

  it('rechaza path traversal fuera del workspace', async () => {
    const attempt = handleReadDirectory({ path: join(workspace, '..') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('rechaza un directorio que no existe', async () => {
    const attempt = handleReadDirectory({ path: join(workspace, 'fantasma') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'FILE_ACCESS_DENIED' });
  });
});

describe('handleCreateFile', () => {
  it('crea el archivo vacío y devuelve su entrada', async () => {
    const path = join(workspace, 'nuevo.ts');

    const result = await handleCreateFile({ path }, workspace);

    expect(result.entry).toEqual({ name: 'nuevo.ts', path, isDirectory: false });
    expect(await readFile(path, 'utf8')).toBe('');
  });

  it('no pisa un archivo que ya existe', async () => {
    // Es la mitad de RF-003 que importa: crear no puede destruir. Sin el modo
    // exclusivo, este contenido se perdería.
    const path = join(workspace, 'ocupado.ts');
    await writeFile(path, 'contenido que no se puede perder', 'utf8');

    await expect(handleCreateFile({ path }, workspace)).rejects.toMatchObject({
      code: 'ENTRY_ALREADY_EXISTS',
    });
    expect(await readFile(path, 'utf8')).toBe('contenido que no se puede perder');
  });

  it('rechaza crear fuera del workspace', async () => {
    const attempt = handleCreateFile({ path: join(workspace, '..', 'afuera.ts') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });
});

describe('handleCreateDirectory', () => {
  it('crea el directorio y devuelve su entrada', async () => {
    const path = join(workspace, 'componentes');

    const result = await handleCreateDirectory({ path }, workspace);

    expect(result.entry).toEqual({ name: 'componentes', path, isDirectory: true });
    expect((await stat(path)).isDirectory()).toBe(true);
  });

  it('falla si ya existe en vez de no hacer nada', async () => {
    // `mkdir` con `recursive` devolvería éxito acá. Que falle es lo que hace
    // que la UI pueda avisar en vez de fingir que creó algo.
    const path = join(workspace, 'existente');
    await mkdir(path);

    await expect(handleCreateDirectory({ path }, workspace)).rejects.toMatchObject({
      code: 'ENTRY_ALREADY_EXISTS',
    });
  });
});

describe('handleRename', () => {
  it('renombra un archivo y devuelve la entrada nueva', async () => {
    const from = join(workspace, 'viejo.ts');
    const to = join(workspace, 'nuevo.ts');
    await writeFile(from, 'const x = 1;', 'utf8');

    const result = await handleRename({ from, to }, workspace);

    expect(result.entry).toEqual({ name: 'nuevo.ts', path: to, isDirectory: false });
    expect(await readFile(to, 'utf8')).toBe('const x = 1;');
    expect(await leftoverTemporaries(workspace)).toHaveLength(0);
  });

  it('renombra un directorio y lo dice en la entrada', async () => {
    const from = join(workspace, 'antes');
    const to = join(workspace, 'despues');
    await mkdir(from);

    const result = await handleRename({ from, to }, workspace);

    expect(result.entry.isDirectory).toBe(true);
  });

  it('no pisa el destino cuando ya existe', async () => {
    // El criterio textual de RF-003: "renombrar a un nombre existente muestra
    // error sin perder datos". `fs.rename` sobrescribe en silencio, así que sin
    // el chequeo previo este contenido desaparecería.
    const from = join(workspace, 'origen.ts');
    const to = join(workspace, 'destino.ts');
    await writeFile(from, 'origen', 'utf8');
    await writeFile(to, 'destino que no se puede perder', 'utf8');

    await expect(handleRename({ from, to }, workspace)).rejects.toMatchObject({
      code: 'ENTRY_ALREADY_EXISTS',
    });

    // Los dos siguen enteros: ni se pisó el destino ni se perdió el origen.
    expect(await readFile(to, 'utf8')).toBe('destino que no se puede perder');
    expect(await readFile(from, 'utf8')).toBe('origen');
  });

  it('rechaza un destino fuera del workspace', async () => {
    // Sin validar `to`, renombrar sería la forma de escribir en cualquier parte
    // del disco con una sola llamada.
    const from = join(workspace, 'adentro.ts');
    await writeFile(from, 'x', 'utf8');

    const attempt = handleRename({ from, to: join(workspace, '..', 'afuera.ts') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
    expect(await readFile(from, 'utf8')).toBe('x');
  });
});

describe('handleDelete', () => {
  it('manda la ruta resuelta a la papelera y no la borra a mano', async () => {
    const path = join(workspace, 'sobra.ts');
    await writeFile(path, 'x', 'utf8');

    const result = await handleDelete({ path }, workspace);

    expect(result).toEqual({ path });
    expect(electron.trashed).toEqual([path]);
    // El archivo sigue ahí porque el doble de la papelera no borra nada. Lo que
    // se verifica es que el handler **no** hizo un `rm` por su cuenta.
    expect(await readFile(path, 'utf8')).toBe('x');
  });

  it('avisa cuando la papelera falla, sin caer a un borrado permanente', async () => {
    // RF-003 pide papelera. Si el sistema operativo no puede, la respuesta es
    // un error: un fallback a `unlink` convertiría "eliminar" en "destruir".
    const path = join(workspace, 'trabado.ts');
    await writeFile(path, 'x', 'utf8');
    electron.trashFails = true;

    await expect(handleDelete({ path }, workspace)).rejects.toMatchObject({
      code: 'TRASH_FAILED',
    });
    expect(await readFile(path, 'utf8')).toBe('x');
  });

  it('rechaza eliminar fuera del workspace', async () => {
    const attempt = handleDelete({ path: join(workspace, '..', 'ajeno.ts') }, workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
    expect(electron.trashed).toHaveLength(0);
  });
});

describe('registerFsIpcHandlers', () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerFsIpcHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registra los canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'fs:readDirectory',
      'fs:readFile',
      'fs:writeFile',
      'fs:createFile',
      'fs:createDirectory',
      'fs:rename',
      'fs:delete',
      // El índice de quick open (RF-205) vive en este dominio: es el mismo
      // recorrido del árbol, con las mismas exclusiones.
      'files:index',
    ]);
  });

  // Cada canal con un payload que sí pasa su schema: la validación Zod corre
  // antes que el chequeo de workspace, y con un payload inválido este test
  // pasaría por el motivo equivocado.
  it.each([
    ['fs:readDirectory', { path: 'C:\\Windows' }],
    ['fs:readFile', { path: 'C:\\Windows\\notepad.exe' }],
    ['fs:writeFile', { path: 'C:\\Windows\\notepad.exe', content: 'x' }],
    ['fs:createFile', { path: 'C:\\Windows\\nuevo.txt' }],
    ['fs:createDirectory', { path: 'C:\\Windows\\nueva' }],
    ['fs:rename', { from: 'C:\\Windows\\a.txt', to: 'C:\\Windows\\b.txt' }],
    ['fs:delete', { path: 'C:\\Windows\\notepad.exe' }],
  ])('%s se niega a operar sin un workspace abierto', async (channel, payload) => {
    // Es la propiedad importante: sin raíz no hay contra qué validar la ruta,
    // así que la única respuesta correcta es negarse. Si algún día este test
    // empieza a fallar, alguien abrió un agujero.
    const listener = electron.handlers.get(channel);

    const result = await listener?.({}, payload);

    expect(result).toMatchObject({ ok: false, error: { code: 'WORKSPACE_NOT_OPEN' } });
  });
});
