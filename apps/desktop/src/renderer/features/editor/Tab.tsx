import type { TabState } from '@pastecode/core';

import { t } from '../../i18n/index.js';

import { middleClickToClose } from './middle-click-close.js';

interface TabProps {
  tab: TabState;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}

/** El nombre del archivo, sin la ruta. */
function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

/**
 * Una pestaña.
 *
 * **Es presentacional**: no lee el store, sólo avisa qué le hicieron
 * ([regla 3 de React](../../../../../../docs/convenciones/codigo.md#reglas-de-react)).
 *
 * Se cierra también con la ruedita, que es lo que espera cualquiera que venga
 * de un navegador o de otro editor. Los dos handlers que hacen falta —y el
 * `preventDefault` que se olvida— están en `middleClickToClose`.
 */
export function Tab({ tab, isActive, onActivate, onClose }: TabProps): React.JSX.Element {
  const name = fileNameOf(tab.path);

  return (
    <div
      role="tab"
      aria-selected={isActive}
      // Un solo tabIndex 0 en toda la tira: se tabula hacia las pestañas una
      // vez y adentro se navega con flechas, como pide el patrón de WAI-ARIA.
      tabIndex={isActive ? 0 : -1}
      className="tabs__tab"
      data-active={isActive}
      data-testid={`tab-${name}`}
      {...middleClickToClose(onClose)}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate();
      }}
    >
      <span className="tabs__name">{name}</span>

      {tab.isDirty && (
        <span
          className="tabs__dirty"
          // El mismo testid que espera el ejemplo de testing.md. Con varias
          // pestañas abiertas hay más de uno, así que una aserción sobre una
          // en particular tiene que acotar por su pestaña.
          data-testid="tab-dirty-indicator"
          aria-label={t('editor.dirty')}
        >
          ●
        </span>
      )}

      <button
        type="button"
        className="tabs__close"
        aria-label={`${t('tabs.close')} ${name}`}
        onClick={(event) => {
          // Sin esto, cerrar también activaría la pestaña que se cierra y
          // quedaría activa la equivocada.
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
