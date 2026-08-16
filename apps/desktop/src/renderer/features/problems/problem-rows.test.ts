import type { Diagnostic } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import type { FileProblems } from '../../stores/problems-store.js';

import { flattenProblemRows } from './problem-rows.js';

/** Un diagnóstico en la posición que pida el test. */
function at(line: number, column: number, message = 'roto'): Diagnostic {
  return {
    range: { start: { line, column }, end: { line, column: column + 1 } },
    severity: 'error',
    message,
    source: null,
    code: null,
  };
}

/** Un archivo con sus diagnósticos. */
function file(diagnostics: Diagnostic[], truncated = false): FileProblems {
  return { diagnostics, truncated };
}

describe('flattenProblemRows', () => {
  it('devuelve una lista vacía sin problemas', () => {
    expect(flattenProblemRows(new Map())).toEqual([]);
  });

  it('pone un encabezado antes de los problemas de cada archivo', () => {
    const rows = flattenProblemRows(new Map([['a.ts', file([at(1, 1), at(2, 1)])]]));

    expect(rows.map((row) => row.kind)).toEqual(['file', 'problem', 'problem']);
  });

  it('cuenta los problemas en el encabezado', () => {
    const [header] = flattenProblemRows(new Map([['a.ts', file([at(1, 1), at(2, 1)])]]));

    expect(header).toEqual({ kind: 'file', path: 'a.ts', problemCount: 2, truncated: false });
  });

  it('ordena los archivos por ruta, no por orden de llegada', () => {
    const rows = flattenProblemRows(
      new Map([
        ['z.ts', file([at(1, 1)])],
        ['a.ts', file([at(1, 1)])],
      ])
    );

    expect(rows.filter((row) => row.kind === 'file').map((row) => row.path)).toEqual([
      'a.ts',
      'z.ts',
    ]);
  });

  it('ordena los problemas por línea y después por columna', () => {
    const rows = flattenProblemRows(
      new Map([['a.ts', file([at(9, 5, 'c'), at(2, 9, 'b'), at(2, 3, 'a')])]])
    );

    expect(
      rows.filter((row) => row.kind === 'problem').map((row) => row.diagnostic.message)
    ).toEqual(['a', 'b', 'c']);
  });

  it('propaga el aviso de recorte al encabezado', () => {
    const [header] = flattenProblemRows(new Map([['a.ts', file([at(1, 1)], true)]]));

    expect(header?.kind === 'file' && header.truncated).toBe(true);
  });
});
