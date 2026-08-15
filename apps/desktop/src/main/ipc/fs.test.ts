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
  handleReadDirectory,
  handleReadFile,
  handleWriteFile,
  registerFsIpcHandlers,
} from './fs.js';

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
}));

let workspace: string;

beforeEach(async () => {
  // realpath desde el arranque: el tmpdir de Windows viene con nombres 8.3 y
  // el de macOS es un symlink. Ver el comentario de path-guard.test.ts.
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'pastecode-fs-')));
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

describe('registerFsIpcHandlers', () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerFsIpcHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registra los tres canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'fs:readDirectory',
      'fs:readFile',
      'fs:writeFile',
    ]);
  });

  // Cada canal con un payload que sí pasa su schema: la validación Zod corre
  // antes que el chequeo de workspace, y con un payload inválido este test
  // pasaría por el motivo equivocado.
  it.each([
    ['fs:readDirectory', { path: 'C:\\Windows' }],
    ['fs:readFile', { path: 'C:\\Windows\\notepad.exe' }],
    ['fs:writeFile', { path: 'C:\\Windows\\notepad.exe', content: 'x' }],
  ])('%s se niega a operar sin un workspace abierto', async (channel, payload) => {
    // Es la propiedad importante: sin raíz no hay contra qué validar la ruta,
    // así que la única respuesta correcta es negarse. Si algún día este test
    // empieza a fallar, alguien abrió un agujero.
    const listener = electron.handlers.get(channel);

    const result = await listener?.({}, payload);

    expect(result).toMatchObject({ ok: false, error: { code: 'WORKSPACE_NOT_OPEN' } });
  });
});
