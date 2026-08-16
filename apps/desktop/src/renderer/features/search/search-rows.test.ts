import type { SearchMatch } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import { flattenSearchRows, splitDisplayPath } from './search-rows.js';

/** Un match cualquiera del archivo indicado. */
function match(path: string, line: number): SearchMatch {
  return { path, line, column: 1, preview: 'x', matchLength: 1 };
}

describe('flattenSearchRows', () => {
  it('pone un encabezado antes de los matches de cada archivo', () => {
    const rows = flattenSearchRows([
      { path: 'a.ts', matches: [match('a.ts', 1), match('a.ts', 5)] },
      { path: 'b.ts', matches: [match('b.ts', 2)] },
    ]);

    expect(rows.map((row) => row.kind)).toEqual(['file', 'match', 'match', 'file', 'match']);
  });

  it('cuenta los matches en el encabezado', () => {
    const [header] = flattenSearchRows([
      { path: 'a.ts', matches: [match('a.ts', 1), match('a.ts', 2)] },
    ]);

    expect(header).toMatchObject({ kind: 'file', matchCount: 2 });
  });

  it('devuelve una lista vacía sin grupos', () => {
    expect(flattenSearchRows([])).toEqual([]);
  });
});

describe('splitDisplayPath', () => {
  it('separa el nombre de la carpeta, relativa a la raíz', () => {
    expect(splitDisplayPath('C:/p/src/main/a.ts', 'C:/p')).toEqual({
      name: 'a.ts',
      folder: 'src/main',
    });
  });

  it('normaliza las barras invertidas de Windows', () => {
    // El mismo caso tiene que dar lo mismo en el runner de Linux del CI.
    expect(splitDisplayPath('C:\\p\\src\\a.ts', 'C:\\p')).toEqual({
      name: 'a.ts',
      folder: 'src',
    });
  });

  it('deja la carpeta vacía para un archivo en la raíz', () => {
    expect(splitDisplayPath('C:/p/a.ts', 'C:/p')).toEqual({ name: 'a.ts', folder: '' });
  });

  it('muestra la ruta entera si el archivo no cuelga de la raíz', () => {
    expect(splitDisplayPath('D:/otro/a.ts', 'C:/p').name).toBe('a.ts');
  });
});
