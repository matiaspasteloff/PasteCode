import type { VisibleNode } from '@pastecode/core';

/** Qué hacer ante una tecla. Ambos campos son opcionales y combinables. */
export interface TreeKeyOutcome {
  /** Índice que pasa a tener el foco. */
  focusIndex?: number;
  /** Nodo a activar: abrir el archivo, o desplegar/replegar la carpeta. */
  activate?: VisibleNode;
}

/**
 * Traduce una tecla a lo que el árbol tiene que hacer.
 *
 * Es una función pura, y por eso está separada del componente: la navegación
 * por teclado de un árbol tiene más casos de borde que el resto del árbol
 * junto —el `←` sobre una carpeta desplegada no hace lo mismo que sobre una
 * replegada, ni sobre un nodo de primer nivel— y todos se testean acá sin
 * montar React.
 *
 * Sigue el patrón `tree` de WAI-ARIA, que es lo que
 * [RNF-21](../../../../../../docs/04-requerimientos-no-funcionales.md) y
 * RNF-23 piden entre los dos.
 *
 * Vive en el renderer y no en `packages/core` porque es traducción de eventos
 * de UI, no lógica de workspace: nada de esto tiene sentido fuera de un árbol
 * en pantalla.
 *
 * @param key El `event.key` del `keydown`.
 * @param rows Las filas visibles, en orden.
 * @param focusedIndex Índice de la fila enfocada.
 * @returns Qué hacer, o `undefined` si la tecla no es del árbol.
 * @example
 * resolveTreeKey('ArrowDown', rows, 0); // { focusIndex: 1 }
 */
export function resolveTreeKey(
  key: string,
  rows: readonly VisibleNode[],
  focusedIndex: number
): TreeKeyOutcome | undefined {
  const current = rows[focusedIndex];
  if (current === undefined) return undefined;

  switch (key) {
    case 'ArrowDown':
      return { focusIndex: Math.min(focusedIndex + 1, rows.length - 1) };
    case 'ArrowUp':
      return { focusIndex: Math.max(focusedIndex - 1, 0) };
    case 'Home':
      return { focusIndex: 0 };
    case 'End':
      return { focusIndex: rows.length - 1 };
    case 'ArrowRight':
      return resolveArrowRight(current, focusedIndex, rows);
    case 'ArrowLeft':
      return resolveArrowLeft(current, focusedIndex, rows);
    case 'Enter':
    case ' ':
      return { activate: current };
    default:
      return undefined;
  }
}

/**
 * `→`: sobre una carpeta replegada la despliega; sobre una ya desplegada baja
 * al primer hijo. Sobre un archivo no hace nada.
 */
function resolveArrowRight(
  current: VisibleNode,
  focusedIndex: number,
  rows: readonly VisibleNode[]
): TreeKeyOutcome | undefined {
  if (!current.node.isDirectory) return undefined;
  if (!current.isExpanded) return { activate: current };

  const child = rows[focusedIndex + 1];

  // Desplegada pero sin hijos a la vista: o está vacía, o todavía están
  // cargando. En ninguno de los dos casos hay adónde bajar.
  return child !== undefined && child.depth > current.depth
    ? { focusIndex: focusedIndex + 1 }
    : undefined;
}

/**
 * `←`: sobre una carpeta desplegada la repliega; en cualquier otro caso sube
 * al padre, que es la fila anterior con menos profundidad.
 */
function resolveArrowLeft(
  current: VisibleNode,
  focusedIndex: number,
  rows: readonly VisibleNode[]
): TreeKeyOutcome | undefined {
  if (current.node.isDirectory && current.isExpanded) return { activate: current };

  for (let index = focusedIndex - 1; index >= 0; index -= 1) {
    const candidate = rows[index];
    if (candidate !== undefined && candidate.depth < current.depth)
      return { focusIndex: index };
  }

  return undefined;
}
