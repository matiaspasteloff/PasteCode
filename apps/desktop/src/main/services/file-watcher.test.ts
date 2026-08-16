import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FileChangeBatch, FileWatcher } from './file-watcher.js';
import { startFileWatcher } from './file-watcher.js';

/** Holgado: el CI de Windows es lento y chokidar espera a que el archivo cierre. */
const TIMEOUT_MS = 15_000;

async function waitFor(condition: () => boolean, describeFailure: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Se agotó la espera: ${describeFailure}`);

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Todos los cambios recibidos, aplanados. */
function pathsOf(batches: readonly FileChangeBatch[]): string[] {
  return batches.flatMap((batch) => batch.changes.map((change) => change.path));
}

describe('startFileWatcher', () => {
  let root: string;
  let watcher: FileWatcher;
  let batches: FileChangeBatch[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pastecode-watch-'));
    batches = [];
  });

  afterEach(async () => {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  });

  /** Arranca el watcher y espera a que chokidar termine el escaneo inicial. */
  async function start(excludeGlobs: readonly string[] = ['**/node_modules']): Promise<void> {
    watcher = startFileWatcher({
      root,
      excludeGlobs,
      onChanges: (batch) => batches.push(batch),
    });

    // Sin esta espera, un archivo creado enseguida se confunde con el escaneo
    // inicial y el test se vuelve flaky, que es lo que la regla 3 prohíbe.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  it('avisa cuando se crea un archivo', async () => {
    await start();

    await writeFile(join(root, 'nuevo.ts'), 'const a = 1;');
    await waitFor(() => pathsOf(batches).length > 0, 'nunca llegó el alta');

    expect(pathsOf(batches)).toContain(join(root, 'nuevo.ts'));
    expect(batches[0]?.changes[0]?.kind).toBe('created');
  });

  it('avisa cuando se borra un archivo', async () => {
    const file = join(root, 'efimero.ts');
    await writeFile(file, 'x');
    await start();

    await rm(file);
    await waitFor(() => pathsOf(batches).length > 0, 'nunca llegó la baja');

    expect(batches.at(-1)?.changes.at(-1)).toMatchObject({ path: file, kind: 'deleted' });
  });

  it('no vigila lo que está excluido', async () => {
    // RF-005: la misma clave que filtra el árbol y la búsqueda filtra el
    // watcher. Y el costo no es filtrar después: es no establecer el watch.
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await start();

    await writeFile(join(root, 'node_modules', 'paquete.js'), 'module.exports = {};');
    await writeFile(join(root, 'real.ts'), 'const a = 1;');
    await waitFor(() => pathsOf(batches).length > 0, 'nunca llegó ningún cambio');

    expect(pathsOf(batches)).toContain(join(root, 'real.ts'));
    expect(pathsOf(batches).some((path) => path.includes('node_modules'))).toBe(false);
  });

  it('junta muchos archivos en una sola descarga', async () => {
    // Un `git checkout` toca miles: de a uno serían miles de saltos de proceso.
    await start();

    for (let index = 0; index < 12; index += 1) {
      await writeFile(join(root, `archivo-${String(index)}.ts`), 'x');
    }

    await waitFor(() => pathsOf(batches).length >= 12, 'no llegaron los doce cambios');

    // Lo que se verifica es que se agruparon, no el número exacto de lotes:
    // depender de eso sería depender del reloj.
    expect(batches.length).toBeLessThan(12);
  });

  it('se traga el cambio de un archivo que escribimos nosotros', async () => {
    // Sin esto, guardar dispara una recarga espuria o un diálogo de conflicto
    // falso contra un cambio que hicimos nosotros mismos.
    const file = join(root, 'propio.ts');
    await writeFile(file, 'inicial');
    await start();

    watcher.noteOwnWrite(file);
    await writeFile(file, 'guardado por nosotros');
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(pathsOf(batches)).not.toContain(file);
  });

  it('la marca de escritura propia se consume una sola vez', async () => {
    // El segundo cambio del mismo archivo ya es externo y tiene que avisarse.
    const file = join(root, 'propio.ts');
    await writeFile(file, 'inicial');
    await start();

    watcher.noteOwnWrite(file);
    await writeFile(file, 'primera');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await writeFile(file, 'segunda, esta es externa');

    await waitFor(() => pathsOf(batches).includes(file), 'nunca avisó el cambio externo');
  });

  it('tolera que se lo cierre dos veces', async () => {
    await start();

    await watcher.close();
    await expect(watcher.close()).resolves.toBeUndefined();
  });
});
