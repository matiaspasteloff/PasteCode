import type { Diagnostic } from '@pastecode/core';

import type { FileProblems } from '../../stores/problems-store.js';

/** Una fila de la lista: el encabezado de un archivo o uno de sus problemas. */
export type ProblemRow =
  | { kind: 'file'; path: string; problemCount: number; truncated: boolean }
  | { kind: 'problem'; path: string; diagnostic: Diagnostic };

/**
 * Aplana los problemas a una lista de filas.
 *
 * Es exactamente la forma que produce `flattenSearchRows` y por la misma razón:
 * el agrupado por archivo se dibuja como una lista plana con encabezados porque
 * un virtualizador necesita **una** lista con un alto por índice, y
 * [codigo.md](../../../../../docs/convenciones/codigo.md#reglas-de-react-renderer)
 * exige virtualizar cualquier lista que pueda pasar los 100 ítems. Un
 * `tsc --noEmit` sobre un proyecto con un import roto pasa esa marca sin
 * esfuerzo.
 *
 * Los archivos se ordenan por ruta y los problemas de cada uno por posición:
 * una lista que se reordena sola cada vez que llega un lote es imposible de
 * clickear.
 *
 * @param byPath Los problemas del store.
 * @returns Las filas, con el encabezado antes de cada bloque.
 * @example
 * flattenProblemRows(byPath);
 */
export function flattenProblemRows(byPath: ReadonlyMap<string, FileProblems>): ProblemRow[] {
  return [...byPath.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([path, file]): ProblemRow[] => [
      {
        kind: 'file',
        path,
        problemCount: file.diagnostics.length,
        truncated: file.truncated,
      },
      ...[...file.diagnostics]
        .toSorted(byPosition)
        .map((diagnostic): ProblemRow => ({ kind: 'problem', path, diagnostic })),
    ]);
}

/** Orden de lectura: por línea y, dentro de la línea, por columna. */
function byPosition(left: Diagnostic, right: Diagnostic): number {
  if (left.range.start.line !== right.range.start.line) {
    return left.range.start.line - right.range.start.line;
  }

  return left.range.start.column - right.range.start.column;
}
