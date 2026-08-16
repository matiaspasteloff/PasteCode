import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';

import { QuickPickRow } from './QuickPickRow.js';

/** Alto de fila, en píxeles. Coincide con `.palette__item` del CSS. */
const ROW_HEIGHT = 28;

/** Cuántas filas se ven de una. Fija el alto máximo de la lista. */
const VISIBLE_ROWS = 12;

interface QuickPickListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDetail?: (item: T) => string;
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (item: T) => void;
  label: string;
  emptyLabel: string;
}

/**
 * El `id` DOM de una opción, para `aria-activedescendant`.
 *
 * Lo calcula una sola función para los dos lados —el input y la lista— porque
 * si cada uno lo armara por su cuenta, un cambio de formato en uno rompería el
 * vínculo sin que nada falle a la vista.
 *
 * @param item El ítem de la opción.
 * @param getKey Cómo sacarle la clave.
 * @returns El `id`, o `undefined` si no hay ítem.
 * @example
 * <input aria-activedescendant={quickPickOptionId(items[0], getKey)} />
 */
export function quickPickOptionId<T>(
  item: T | undefined,
  getKey: (item: T) => string
): string | undefined {
  return item === undefined ? undefined : `palette-option-${getKey(item)}`;
}

/**
 * La lista de candidatos de un `QuickPick`, virtualizada.
 *
 * Virtualizada porque el índice de quick open de un repositorio real son miles
 * de entradas y `codigo.md` lo exige a partir de cien. Eso trae un requisito
 * que una lista normal no tiene: mover la selección con las flechas no alcanza
 * para verla, porque la fila elegida puede no estar dibujada. De ahí el
 * `scrollToIndex`.
 */
export function QuickPickList<T>(props: QuickPickListProps<T>): React.JSX.Element {
  const listRef = useRef<HTMLUListElement>(null);

  const virtualizer = useVirtualizer({
    count: props.items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(props.highlighted);
  }, [props.highlighted, virtualizer]);

  return (
    <ul
      ref={listRef}
      id="palette-list"
      role="listbox"
      aria-label={props.label}
      className="palette__list"
      style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS }}
    >
      {props.items.length === 0 && <li className="palette__empty">{props.emptyLabel}</li>}

      {props.items.length > 0 && (
        <QuickPickCanvas
          {...props}
          totalSize={virtualizer.getTotalSize()}
          virtualItems={virtualizer.getVirtualItems()}
        />
      )}
    </ul>
  );
}

/**
 * El lienzo con las filas visibles.
 *
 * Lleva `role="presentation"` para desaparecer del árbol de accesibilidad: es
 * un elemento de posicionamiento, y dejarlo entre el `listbox` y sus `option`
 * rompería la relación que espera un lector de pantalla.
 */
function QuickPickCanvas<T>({
  items,
  getKey,
  getLabel,
  getDetail,
  highlighted,
  onHighlight,
  onPick,
  totalSize,
  virtualItems,
}: QuickPickListProps<T> & {
  totalSize: number;
  virtualItems: readonly VirtualItem[];
}): React.JSX.Element {
  return (
    <li role="presentation" className="palette__canvas" style={{ height: totalSize }}>
      {virtualItems.map((virtual) => {
        const item = items[virtual.index];
        if (item === undefined) return null;

        return (
          <QuickPickRow
            key={getKey(item)}
            item={item}
            id={quickPickOptionId(item, getKey)}
            offset={virtual.start}
            isHighlighted={virtual.index === highlighted}
            getLabel={getLabel}
            {...(getDetail === undefined ? {} : { getDetail })}
            onHighlight={() => {
              onHighlight(virtual.index);
            }}
            onPick={() => {
              onPick(item);
            }}
          />
        );
      })}
    </li>
  );
}
