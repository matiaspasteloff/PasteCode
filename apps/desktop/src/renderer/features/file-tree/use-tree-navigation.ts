import type { FileTreeNode, VisibleNode } from '@pastecode/core';
import { useState } from 'react';

import { useFileTreeStore } from '../../stores/file-tree-store.js';

import { resolveTreeKey } from './tree-keyboard.js';

/** Lo que el árbol necesita para responder al teclado y al mouse. */
interface TreeNavigation {
  /** Índice de la fila que recibe el foco al tabular hacia el árbol. */
  focusedIndex: number;
  /** Abre el archivo o despliega la carpeta, y le pasa el foco. */
  activate: (visible: VisibleNode) => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Foco y activación del árbol, en un solo lugar.
 *
 * Está separado del componente porque el componente ya tiene bastante con la
 * virtualización: mezclar las dos cosas empuja `FileTree` por encima del
 * límite de 50 líneas de [RNF-20](../../../../../../docs/04-requerimientos-no-funcionales.md),
 * y ese límite existe justamente para forzar esta separación.
 *
 * La decisión de qué hace cada tecla no está acá sino en `resolveTreeKey`, que
 * es puro. Acá sólo queda el estado de React.
 *
 * @param rows Filas visibles, en orden.
 * @param onSelectFile Qué hacer cuando se activa un archivo.
 * @param toggleFolder Qué hacer cuando se activa una carpeta.
 * @returns El índice enfocado y los dos manejadores.
 * @example
 * const { focusedIndex, activate, handleKeyDown } = useTreeNavigation(rows, open, toggle);
 */
export function useTreeNavigation(
  rows: readonly VisibleNode[],
  onSelectFile: (path: string) => void,
  toggleFolder: (path: string) => Promise<void>
): TreeNavigation {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const startRename = useFileTreeStore((state) => state.startRename);
  const requestDeletion = useFileTreeStore((state) => state.requestDeletion);

  const activate = (visible: VisibleNode): void => {
    setFocusedIndex(rows.indexOf(visible));

    if (visible.node.isDirectory) void toggleFolder(visible.node.path);
    else onSelectFile(visible.node.path);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const outcome = resolveTreeKey(event.key, rows, focusedIndex);
    if (outcome === undefined) return;

    // Sólo se cancela el default cuando la tecla es nuestra: así `Tab` sigue
    // sacando el foco del árbol y no hay trampa de foco (RNF-21).
    event.preventDefault();

    if (outcome.focusIndex !== undefined) setFocusedIndex(outcome.focusIndex);
    if (outcome.activate !== undefined) activate(outcome.activate);
    if (outcome.rename !== undefined) startRename(nodeOf(outcome.rename));
    if (outcome.remove !== undefined) requestDeletion(nodeOf(outcome.remove));
  };

  return { focusedIndex, activate, handleKeyDown };
}

/**
 * El nodo de una fila visible.
 *
 * `VisibleNode` es el nodo más lo que hace falta para pintarlo —profundidad,
 * posición en el nivel—, y nada de eso le interesa al store, que trabaja sobre
 * el árbol y no sobre lo que se ve.
 */
function nodeOf(visible: VisibleNode): FileTreeNode {
  return visible.node;
}
