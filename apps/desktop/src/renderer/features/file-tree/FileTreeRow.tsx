import type { VisibleNode } from '@pastecode/core';

/** Sangrado por nivel. Coincide con `--file-tree-indent` de global.css. */
const INDENT_REM = 0.75;

interface FileTreeRowProps {
  visible: VisibleNode;
  /** Desplazamiento vertical que le asignó el virtualizador, en píxeles. */
  offset: number;
  /** Si es la fila que recibe el foco al tabular hacia el árbol. */
  isFocused: boolean;
  /** Si es el archivo abierto en el editor. */
  isSelected: boolean;
  onActivate: (visible: VisibleNode) => void;
}

/**
 * Una fila del árbol.
 *
 * **Es presentacional**: no lee stores ni llama al IPC, sólo avisa que la
 * activaron ([regla 3 de React](../../../../../../docs/convenciones/codigo.md#reglas-de-react)).
 * Eso es lo que la hace testeable sin montar el árbol entero.
 *
 * Es un `div` con `role="treeitem"` y no un `<li>` porque el virtualizador
 * posiciona las filas en absoluto: una lista real tendría los ítems fuera de
 * su `<ul>` en el orden del DOM, y los lectores de pantalla anunciarían mal
 * la cantidad. Con roles explícitos, `aria-level` y `aria-setsize` dicen la
 * verdad aunque el DOM esté incompleto (RNF-23).
 *
 * El posicionamiento absoluto va sobre este mismo elemento y no sobre un
 * envoltorio: un div intermedio sin rol rompería la relación entre el `tree` y
 * sus `treeitem`, y taparlo con `role="presentation"` es una capa de más para
 * decir "ignorame".
 */
export function FileTreeRow({
  visible,
  offset,
  isFocused,
  isSelected,
  onActivate,
}: FileTreeRowProps): React.JSX.Element {
  const { node, depth, isExpanded, positionInLevel, levelSize } = visible;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      // Con el árbol virtualizado, en el DOM hay treinta filas de cinco mil.
      // Sin esto, un lector de pantalla cuenta lo que ve y anuncia "3 de 30".
      aria-posinset={positionInLevel}
      aria-setsize={levelSize}
      aria-selected={isSelected}
      // Sólo las carpetas tienen estado de expansión. Ponérselo a un archivo
      // le dice al lector de pantalla que se puede desplegar, y no se puede.
      {...(node.isDirectory ? { 'aria-expanded': isExpanded } : {})}
      // Un solo tabIndex 0 en todo el árbol: se tabula hacia el árbol una vez
      // y adentro se navega con flechas. Es el patrón de árbol de la WAI-ARIA
      // y lo que evita tener que tabular 5.000 veces para pasar de largo.
      tabIndex={isFocused ? 0 : -1}
      className="file-tree__row"
      data-testid={`file-tree-row-${node.name}`}
      data-selected={isSelected}
      style={{
        paddingInlineStart: `${String(depth * INDENT_REM + 0.5)}rem`,
        transform: `translateY(${String(offset)}px)`,
      }}
      onClick={() => {
        onActivate(visible);
      }}
    >
      <span aria-hidden="true" className="file-tree__icon">
        {node.isDirectory ? (isExpanded ? '▾' : '▸') : '·'}
      </span>
      <span className="file-tree__name">{node.name}</span>
    </div>
  );
}
