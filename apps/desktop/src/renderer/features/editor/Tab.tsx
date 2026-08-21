import type { TabState } from '@pastecode/core';

import { IconClose } from '../../components/icons/IconClose.js';
import { IconFile } from '../../components/icons/IconFile.js';
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
 * Tres detalles del rediseño, y ninguno es decoración:
 *
 * - **El icono sale de `fileIconFor`**, el mismo que usa el árbol de archivos.
 *   Es lo que hace que una pestaña se reconozca por su forma antes de leerla, y
 *   reusar la función es lo que evita una segunda tabla de extensiones.
 * - **El punto de sucio se vuelve una ×** al pasar el mouse. Son la misma cosa
 *   en el mismo lugar —el estado del archivo y qué hacer con él— y ocupar dos
 *   ranuras obligaba a apuntar a un blanco de ocho píxeles al lado de otro.
 * - **Se cierra con la ruedita**, que es lo que espera cualquiera que venga de
 *   un navegador. Los dos handlers que hacen falta —y el `preventDefault` que
 *   se olvida— están en `middleClickToClose`.
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
      data-dirty={tab.isDirty}
      data-testid={`tab-${name}`}
      title={tab.path}
      {...middleClickToClose(onClose)}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate();
      }}
    >
      <IconFile size={14} name={name} />
      <span className="tabs__name">{name}</span>

      {tab.isDirty && (
        <span
          className="tabs__dirty"
          // El mismo testid que espera el ejemplo de testing.md. Con varias
          // pestañas abiertas hay más de uno, así que una aserción sobre una
          // en particular tiene que acotar por su pestaña.
          data-testid="tab-dirty-indicator"
          aria-label={t('editor.dirty')}
          // `aria-hidden` no: el estado sucio es información, y es la única
          // señal de que hay algo sin guardar. Lo que sí se esconde del
          // teclado es que es puramente visual —cerrar tiene su botón—.
          aria-hidden={false}
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
        <IconClose size={12} />
      </button>
    </div>
  );
}
