import { t } from '../i18n/index.js';
import { useCommandStore } from '../stores/command-store.js';
import { useViewStore } from '../stores/view-store.js';

import { SIDE_VIEW_REGISTRY } from './view-registry.js';

/**
 * El rail vertical de vistas.
 *
 * **Dispara comandos, no acciones del store.** Podría llamar a
 * `useViewStore.toggleSide` directo y sería una línea menos, pero entonces
 * habría dos caminos para mostrar la búsqueda —el botón y `Ctrl+Shift+F`— que
 * pueden divergir. El paso 17 refactorizó todo lo demás para que pasara por el
 * registro de comandos; esto es lo mismo.
 *
 * Es un `<nav>` con **botones de dos estados** y no un `role="tablist"`, aunque
 * de lejos se parezca. Dos razones, y la primera la cazaron los E2E existentes:
 * el tab strip del editor ya es un tablist, así que un segundo `role="tab"` en
 * la misma página hace que `getByRole('tab')` devuelva las dos cosas mezcladas
 * — y lo que le pasa a un test le pasa igual a un lector de pantalla, que
 * anunciaría dos conjuntos de pestañas sin relación entre sí. La segunda es que
 * un tab de verdad no se puede deseleccionar, y acá clickear la vista activa
 * colapsa la barra: eso es un botón que se aprieta y se suelta, y `aria-pressed`
 * lo dice tal cual (RNF-23).
 */
export function ActivityBar(): React.JSX.Element {
  const sideView = useViewStore((state) => state.sideView);
  const run = useCommandStore((state) => state.run);

  return (
    <nav className="activity-bar" aria-label={t('view.activityBar')}>
      {SIDE_VIEW_REGISTRY.map(({ id, labelKey, commandId, Icon }) => {
        const isActive = sideView === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            // El icono no dice nada por sí solo: sin esto, un lector de
            // pantalla anuncia un botón vacío (RNF-23).
            aria-label={t(labelKey)}
            title={t(labelKey)}
            className="activity-bar__item"
            data-testid={`activity-${id}`}
            data-active={isActive}
            onClick={() => {
              void run(commandId);
            }}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </nav>
  );
}
