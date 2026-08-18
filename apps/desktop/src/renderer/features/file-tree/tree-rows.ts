import type { VisibleNode } from '@pastecode/core';

import type { TreeEdit } from '../../stores/file-tree-store.js';

/** Una fila a pintar: un nodo del árbol, o el campo de texto de una edición. */
export type TreeRow =
  | { readonly kind: 'node'; readonly visible: VisibleNode }
  | {
      readonly kind: 'edit';
      readonly depth: number;
      readonly initialName: string;
      readonly isDirectory: boolean;
    };

/**
 * Mezcla la edición abierta con las filas visibles del árbol.
 *
 * Es puro y vive aparte del componente por la misma razón que `tree-keyboard`:
 * la decisión de dónde va la fila del campo es lógica con casos de borde
 * —crear en la raíz, renombrar algo que dejó de estar visible— y se testea
 * mejor sin montar un árbol virtualizado.
 *
 * Renombrar **reemplaza** la fila, así que el nombre viejo no queda a la vista
 * mientras se escribe el nuevo. Crear **inserta** una fila justo después de la
 * carpeta que la contiene, que es donde va a aparecer la entrada cuando exista.
 *
 * @param nodes Filas visibles del árbol, en orden.
 * @param edit La edición abierta, o `null`.
 * @returns Las filas a pintar, en orden.
 * @example
 * treeRowsWithEdit(rows, { kind: 'createFile', parentPath: 'C:\\p\\src' });
 */
export function treeRowsWithEdit(
  nodes: readonly VisibleNode[],
  edit: TreeEdit | null
): readonly TreeRow[] {
  const rows: TreeRow[] = nodes.map((visible) => ({ kind: 'node', visible }));

  if (edit === null) return rows;

  if (edit.kind === 'rename') return withRenameRow(rows, edit.path, edit.currentName);

  return withCreateRow(rows, edit.parentPath, edit.kind === 'createDirectory');
}

/** Cambia por un campo la fila que se está renombrando, si sigue visible. */
function withRenameRow(
  rows: readonly TreeRow[],
  path: string,
  currentName: string
): readonly TreeRow[] {
  return rows.map((row) => {
    if (row.kind !== 'node' || row.visible.node.path !== path) return row;

    return {
      kind: 'edit',
      depth: row.visible.depth,
      initialName: currentName,
      isDirectory: row.visible.node.isDirectory,
    };
  });
}

/**
 * Mete el campo de creación adentro de su carpeta.
 *
 * Si la carpeta no está entre las filas, lo que se está creando va en la raíz
 * del workspace: la raíz no tiene fila propia —el árbol arranca en sus hijos—,
 * así que el campo va primero y al nivel cero.
 */
function withCreateRow(
  rows: readonly TreeRow[],
  parentPath: string,
  isDirectory: boolean
): readonly TreeRow[] {
  const parentIndex = rows.findIndex(
    (row) => row.kind === 'node' && row.visible.node.path === parentPath
  );
  const parent = rows[parentIndex];
  const depth = parent?.kind === 'node' ? parent.visible.depth + 1 : 0;
  const editRow: TreeRow = { kind: 'edit', depth, initialName: '', isDirectory };

  if (parentIndex === -1) return [editRow, ...rows];

  return [...rows.slice(0, parentIndex + 1), editRow, ...rows.slice(parentIndex + 1)];
}
