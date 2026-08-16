import { QuickPickList, quickPickOptionId } from './QuickPickList.js';
import { useQuickPickKeyboard } from './use-quick-pick-keyboard.js';

interface QuickPickProps<T> {
  isOpen: boolean;
  /** Los candidatos, **ya filtrados y ordenados** por quien lo usa. */
  items: readonly T[];
  /** Clave estable de cada ítem. Es también su `id` en el DOM. */
  getKey: (item: T) => string;
  /** El texto principal de la fila. */
  getLabel: (item: T) => string;
  /** Texto secundario, en gris. La carpeta, en quick open. */
  getDetail?: (item: T) => string;
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (item: T) => void;
  onClose: () => void;
  placeholder: string;
  label: string;
  emptyLabel: string;
}

/**
 * Un selector rápido: un campo de texto y una lista de candidatos.
 *
 * Es el componente que la paleta de comandos ([RF-701](../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración))
 * y quick open ([RF-205](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace))
 * comparten. Se generalizó a partir de la paleta en vez de duplicarla: son la
 * misma interacción con distinta lista, y dos copias significan que el día que
 * se arregle el manejo del teclado en una, la otra sigue rota.
 *
 * **Es presentacional.** No sabe qué es un comando ni qué es un archivo: el
 * filtrado, el orden y qué hacer al elegir son de quien lo usa. Lo que aporta
 * es la interacción —foco, flechas, Enter, Escape— y la accesibilidad.
 *
 * El patrón ARIA es `combobox` + `listbox`: el foco se queda en el input
 * mientras las flechas mueven la selección, y `aria-activedescendant` le dice
 * al lector de pantalla cuál está elegida sin mover el foco real (RNF-23).
 */
export function QuickPick<T>(props: QuickPickProps<T>): React.JSX.Element | null {
  const { isOpen, items, getKey, query, onQueryChange, onPick, onClose } = props;

  const keyboard = useQuickPickKeyboard(items.length, isOpen, onClose, (index) => {
    const chosen = items[index];
    if (chosen !== undefined) onPick(chosen);
  });

  if (!isOpen) return null;

  return (
    <div className="palette" role="presentation" onClick={onClose}>
      {/* El click de adentro no tiene que cerrar el selector. */}
      <div
        className="palette__panel"
        role="presentation"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <input
          ref={keyboard.inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={quickPickOptionId(items[keyboard.highlighted], getKey)}
          aria-label={props.label}
          className="palette__input"
          placeholder={props.placeholder}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            keyboard.setHighlighted(0);
          }}
          onKeyDown={keyboard.handleKeyDown}
        />

        <QuickPickList
          items={items}
          getKey={getKey}
          getLabel={props.getLabel}
          {...(props.getDetail === undefined ? {} : { getDetail: props.getDetail })}
          highlighted={keyboard.highlighted}
          onHighlight={keyboard.setHighlighted}
          onPick={onPick}
          label={props.label}
          emptyLabel={props.emptyLabel}
        />
      </div>
    </div>
  );
}
