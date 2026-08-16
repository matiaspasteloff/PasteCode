import type { SearchMatch } from '@pastecode/core';

import type { SearchGroup } from '../../stores/search-store.js';

/** Una fila de la lista: el encabezado de un archivo o uno de sus matches. */
export type SearchRow =
  | { kind: 'file'; path: string; matchCount: number }
  | { kind: 'match'; path: string; match: SearchMatch };

/**
 * Aplana los grupos a una lista de filas.
 *
 * El agrupado por archivo de [RF-202](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * se dibuja como una lista plana y no como una lista de listas porque tiene
 * que estar virtualizada: `codigo.md` lo exige para más de 100 ítems, y una
 * búsqueda en este mismo repositorio pasa esa marca con la primera palabra que
 * se escriba. Un virtualizador necesita **una** lista con un alto por índice.
 *
 * Es puro para poder testear la forma de la lista sin montar nada.
 *
 * @param groups Los grupos, en el orden en que llegaron.
 * @returns Las filas, con el encabezado antes de cada bloque.
 * @example
 * flattenSearchRows([{ path: 'a.ts', matches: [match] }]);
 * // [{ kind: 'file', ... }, { kind: 'match', ... }]
 */
export function flattenSearchRows(groups: readonly SearchGroup[]): SearchRow[] {
  return groups.flatMap((group): SearchRow[] => [
    { kind: 'file', path: group.path, matchCount: group.matches.length },
    ...group.matches.map((match): SearchRow => ({ kind: 'match', path: group.path, match })),
  ]);
}

/**
 * El nombre de archivo y la carpeta, para el encabezado.
 *
 * Se parte a mano y no con `node:path` porque el renderer no tiene acceso a
 * Node, que es la misma razón por la que `workspaceDisplayName` vive en core.
 *
 * @param path Ruta absoluta.
 * @param root Raíz del workspace, para acortar la carpeta.
 * @returns El nombre y la carpeta relativa.
 * @example
 * splitDisplayPath('C:\\p\\src\\a.ts', 'C:\\p'); // { name: 'a.ts', folder: 'src' }
 */
export function splitDisplayPath(path: string, root: string): { name: string; folder: string } {
  const normalized = path.replaceAll('\\', '/');
  const relative = normalized.startsWith(root.replaceAll('\\', '/'))
    ? normalized.slice(root.length).replace(/^\//, '')
    : normalized;

  const cut = relative.lastIndexOf('/');

  return {
    name: cut === -1 ? relative : relative.slice(cut + 1),
    folder: cut === -1 ? '' : relative.slice(0, cut),
  };
}
