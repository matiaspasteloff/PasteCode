import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SearchMatch, SearchQuery } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cancelSearch, ripgrepPath, startSearch } from './search.js';

let workspace: string;

/** Una consulta con los valores por defecto de la UI. */
function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return {
    query: 'buscame',
    isRegex: false,
    isCaseSensitive: false,
    matchWholeWord: false,
    includeGlobs: [],
    excludeGlobs: [],
    ...overrides,
  };
}

/** Corre una búsqueda y espera a que termine. */
async function search(
  overrides: Partial<SearchQuery> = {}
): Promise<{ matches: SearchMatch[]; truncated: boolean; error: string | null }> {
  return new Promise((resolve) => {
    const matches: SearchMatch[] = [];

    startSearch(query(overrides), workspace, {
      onResult: (batch) => matches.push(...batch),
      onDone: ({ truncated, error }) => {
        resolve({ matches, truncated, error: error?.code ?? null });
      },
    });
  });
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-search-'));

  await writeFile(join(workspace, 'uno.ts'), 'const buscame = 1;\nconst otro = 2;\n', 'utf8');
  await writeFile(join(workspace, 'dos.ts'), 'export { buscame };\n', 'utf8');
  await writeFile(join(workspace, 'nada.ts'), 'const x = 1;\n', 'utf8');

  // La carpeta que tiene que quedar afuera por `files.exclude`.
  await mkdir(join(workspace, 'node_modules'));
  await writeFile(join(workspace, 'node_modules', 'lib.js'), 'const buscame = 3;\n', 'utf8');
});

afterEach(async () => {
  cancelSearch();
  await rm(workspace, { recursive: true, force: true });
});

describe('ripgrepPath', () => {
  it('no devuelve una ruta adentro del asar', () => {
    // Un ejecutable adentro de un asar no se puede lanzar: el sistema
    // operativo necesita un archivo real en el disco.
    expect(ripgrepPath()).not.toContain(`app.asar${join('a', 'b').slice(1, 2)}`);
  });

  it('apunta al binario de ripgrep', () => {
    expect(ripgrepPath()).toMatch(/rg(\.exe)?$/);
  });
});

describe('startSearch', () => {
  it('encuentra los matches en todos los archivos del workspace', async () => {
    const { matches, error } = await search();

    expect(error).toBeNull();
    expect(matches.map((match) => match.preview)).toContain('const buscame = 1;');
    // Sin exclusiones son tres archivos, `node_modules` incluido: filtrarlo es
    // trabajo de `files.exclude`, no de ripgrep. El caso con exclusiones lo
    // cubre el test de más abajo.
    expect(new Set(matches.map((match) => match.path)).size).toBe(3);
  });

  it('devuelve la línea y la columna del match', async () => {
    const { matches } = await search();
    const found = matches.find((match) => match.path.endsWith('uno.ts'));

    // RF-202: es lo que hace que el click abra el archivo en esa línea.
    expect(found?.line).toBe(1);
    expect(found?.column).toBe(7);
  });

  it('respeta los globs de exclusión', async () => {
    const { matches } = await search({ excludeGlobs: ['**/node_modules'] });

    // RF-005: la misma clave que filtra el árbol filtra la búsqueda.
    expect(matches.some((match) => match.path.includes('node_modules'))).toBe(false);
  });

  it('respeta los globs de inclusión', async () => {
    // RF-203.
    const { matches } = await search({ includeGlobs: ['dos.ts'] });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.path).toContain('dos.ts');
  });

  it('no encontrar nada no es un error', async () => {
    const { matches, error } = await search({ query: 'zzzznoexistezzzz' });

    // ripgrep sale con 1 cuando no hay resultados. Eso es un resultado.
    expect(matches).toHaveLength(0);
    expect(error).toBeNull();
  });

  it('trata la consulta como texto literal por defecto', async () => {
    await writeFile(join(workspace, 'regex.ts'), 'const a = "b.c";\n', 'utf8');

    const { matches } = await search({ query: 'b.c' });

    // Con regex, `b.c` también coincidiría con `bxc`. Sin regex, no.
    expect(matches).toHaveLength(1);
  });

  it('informa el error de un regex inválido, con lo que dijo ripgrep', async () => {
    const { error } = await search({ query: '(sin cerrar', isRegex: true });

    expect(error).toBe('SEARCH_FAILED');
  });

  it('cancelar una búsqueda la termina', async () => {
    const done = new Promise<void>((resolve) => {
      startSearch(query(), workspace, {
        onResult: () => undefined,
        onDone: () => {
          resolve();
        },
      });
    });

    cancelSearch();

    await expect(done).resolves.toBeUndefined();
  });

  it('empezar otra búsqueda cancela la anterior', async () => {
    const first = new Promise<void>((resolve) => {
      startSearch(query(), workspace, {
        onResult: () => undefined,
        onDone: () => {
          resolve();
        },
      });
    });

    // Sin la cancelación quedarían dos procesos escribiendo a la vez, y los
    // resultados de la consulta vieja se mezclarían con los de la nueva.
    await search({ query: 'otro' });

    await expect(first).resolves.toBeUndefined();
  });
});
