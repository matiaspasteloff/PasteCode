import { middleClickToClose } from '../../features/editor/middle-click-close.js';
import { t } from '../../i18n/index.js';
import type { TerminalSlot } from '../../stores/terminal-store.js';
import { useTerminalStore } from '../../stores/terminal-store.js';

/**
 * La tira de terminales abiertas, a la derecha de la barra del panel inferior.
 *
 * **Va donde va, y ahí está el arreglo del layout.** Antes era una segunda
 * fila con su propio botón de esconder el panel: dos tiras horizontales de
 * cromo apiladas, y un botón que duplicaba el que el panel inferior ya tiene a
 * la derecha. Ahora se corre al extremo derecho de la fila de pestañas del
 * panel, como en VS Code, y el botón duplicado desapareció.
 *
 * Una tira y no un `<select>`: con dos o tres terminales —que es el caso
 * normal de [RF-302](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)—
 * un desplegable esconde detrás de un click lo que entra de sobra en la barra,
 * y cerrar una sesión desde adentro de un `<select>` no se puede.
 */
export function TerminalTabs(): React.JSX.Element {
  const slots = useTerminalStore((state) => state.slots);
  const activeSlotId = useTerminalStore((state) => state.activeSlotId);
  const activate = useTerminalStore((state) => state.activate);
  const close = useTerminalStore((state) => state.close);
  const openSlot = useTerminalStore((state) => state.openSlot);

  return (
    <div className="terminal-tabs">
      <ul className="terminal-tabs__list" aria-label={t('terminal.sessions')}>
        {slots.map((slot) => (
          <li key={slot.slotId}>
            <button
              type="button"
              className="terminal-tabs__tab"
              aria-current={slot.slotId === activeSlotId}
              {...middleClickToClose(() => {
                void close(slot.slotId);
              })}
              onClick={() => {
                activate(slot.slotId);
              }}
            >
              {displayNameOf(slot)}
            </button>
            <button
              type="button"
              className="terminal-tabs__close"
              aria-label={`${t('terminal.close')} ${displayNameOf(slot)}`}
              onClick={() => {
                void close(slot.slotId);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="terminal-tabs__new"
        aria-label={t('terminal.create')}
        title={t('terminal.create')}
        onClick={openSlot}
      >
        +
      </button>
    </div>
  );
}

/**
 * Cómo se llama una terminal en la lista.
 *
 * El nombre bueno lo elige el main al lanzar el shell —desambiguado con un
 * sufijo cuando hay dos iguales—, así que mientras xterm mide no hay ninguno
 * todavía. Se muestra un provisorio en vez de una entrada en blanco: el hueco
 * dura milisegundos, pero un hueco es peor que una palabra.
 */
function displayNameOf(slot: TerminalSlot): string {
  return slot.session?.displayName ?? t('terminal.starting');
}
