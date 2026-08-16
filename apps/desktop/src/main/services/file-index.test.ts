import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildFileIndex } from './file-index.js';

let workspace: string;

/** Las rutas relativas del índice, que es lo que se compara. */
async function index(excludes: readonly string[] = []): Promise<string[]> {
  const files = await buildFileIndex(workspace, excludes);

  return files.map((file) => file.relativePath).sort();
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-index-'));

  await writeFile(join(workspace, 'raiz.ts'), '', 'utf8');
  await mkdir(join(workspace, 'src', 'main'), { recursive: true });
  await writeFile(join(workspace, 'src', 'uno.ts'), '', 'utf8');
  await writeFile(join(workspace, 'src', 'main', 'dos.ts'), '', 'utf8');
  await mkdir(join(workspace, 'node_modules', 'lib'), { recursive: true });
  await writeFile(join(workspace, 'node_modules', 'lib', 'index.js'), '', 'utf8');
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('buildFileIndex', () => {
  it('recorre el árbol entero, no un solo nivel', async () => {
    expect(await index()).toContain('src/main/dos.ts');
  });

  it('devuelve las rutas relativas con barras normales', async () => {
    // El separador no puede depender de en qué sistema corre: es lo que se
    // muestra y lo que se matchea.
    const files = await index();

    expect(files).toContain('src/uno.ts');
    expect(files.some((file) => file.includes('\\'))).toBe(false);
  });

  it('no incluye directorios, sólo archivos', async () => {
    expect(await index()).not.toContain('src');
  });

  it('respeta las exclusiones de files.exclude', async () => {
    // Es el mismo lector que usa el árbol, así que quick open y el árbol ven
    // exactamente los mismos archivos.
    const files = await index(['**/node_modules']);

    expect(files.some((file) => file.startsWith('node_modules'))).toBe(false);
    expect(files).toContain('raiz.ts');
  });

  it('sin exclusiones incluye todo', async () => {
    expect(await index()).toContain('node_modules/lib/index.js');
  });

  it('devuelve la ruta absoluta junto a la relativa', async () => {
    const files = await buildFileIndex(workspace, []);
    const found = files.find((file) => file.relativePath === 'raiz.ts');

    // La absoluta es la que se abre; la relativa es la que se muestra.
    expect(found?.path).toBe(join(workspace, 'raiz.ts'));
  });

  it('no falla con un workspace vacío', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'pastecode-index-vacio-'));

    await expect(buildFileIndex(empty, [])).resolves.toEqual([]);
    await rm(empty, { recursive: true, force: true });
  });
});
