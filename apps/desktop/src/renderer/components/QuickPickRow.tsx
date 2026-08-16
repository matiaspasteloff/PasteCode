interface QuickPickRowProps<T> {
  item: T;
  id: string | undefined;
  offset: number;
  isHighlighted: boolean;
  getLabel: (item: T) => string;
  getDetail?: (item: T) => string;
  onHighlight: () => void;
  onPick: () => void;
}

/**
 * Una fila del `QuickPick`.
 *
 * Es un `div` con `role="option"` y no un `<li>` porque la lista virtualizada
 * necesita un lienzo intermedio con el alto total, y meter un elemento sin rol
 * entre el `listbox` y sus `option` rompe la relación que espera un lector de
 * pantalla. El lienzo lleva `role="presentation"` justamente para desaparecer
 * de ese árbol.
 */
export function QuickPickRow<T>({
  item,
  id,
  offset,
  isHighlighted,
  getLabel,
  getDetail,
  onHighlight,
  onPick,
}: QuickPickRowProps<T>): React.JSX.Element {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isHighlighted}
      className="palette__item"
      data-highlighted={isHighlighted}
      style={{ transform: `translateY(${String(offset)}px)` }}
      onMouseEnter={onHighlight}
      onClick={onPick}
    >
      <span className="palette__item-label">{getLabel(item)}</span>
      {getDetail !== undefined && (
        <span className="palette__item-detail">{getDetail(item)}</span>
      )}
    </div>
  );
}
