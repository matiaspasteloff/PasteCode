import { middleClickToClose } from '../features/editor/middle-click-close.js';
import { t } from '../i18n/index.js';
import type { PanelView } from '../stores/view-store.js';
import { useViewStore } from '../stores/view-store.js';

import { IconClose } from './icons/IconClose.js';
import { PANEL_VIEW_REGISTRY } from './panel-registry.js';

/**
 * El panel inferior, con una pestaña por inquilino.
 *
 * Vive **adentro** del área de edición como columna flex y no como fila de la
 * grilla de la app: no debe extenderse por debajo de la barra lateral, y así
 * conserva intacta la geometría que ya tenía `TerminalPanel`.
 *
 * **Las superficies de todas las pestañas siguen montadas.** Es el mismo truco
 * de `hidden` que `TerminalPanel` ya usaba entre sesiones y por la misma razón:
 * desmontar una terminal tira el scrollback de xterm, así que cambiar a
 * Problemas y volver perdería todo lo que el shell había escrito. El comentario
 * que lo explicaba sube un nivel, porque ahora aplica a dos ejes.
 */
export function BottomPanel(): React.JSX.Element | null {
  const panelView = useViewStore((state) => state.panelView);

  if (panelView === null) return null;

  return (
    <section className="bottom-panel" aria-label={t('panel.label')}>
      <PanelTabs panelView={panelView} />

      {PANEL_VIEW_REGISTRY.map(({ id, render }) => (
        <div
          key={id}
          className="bottom-panel__body"
          role="tabpanel"
          hidden={panelView !== id}
          data-testid={`panel-body-${id}`}
        >
          {render()}
        </div>
      ))}
    </section>
  );
}

/**
 * La fila de pestañas del panel, con los controles del inquilino y el cierre.
 *
 * Sale del componente principal por el límite de 50 líneas por función de
 * RNF-20. El corte cae donde corresponde: arriba está *qué panel se ve*, acá
 * está *cómo se elige*.
 */
function PanelTabs({ panelView }: { panelView: PanelView }): React.JSX.Element {
  const showPanel = useViewStore((state) => state.showPanel);
  const closePanel = useViewStore((state) => state.closePanel);

  return (
    <div className="bottom-panel__tabs" role="tablist" aria-label={t('panel.tabs')}>
      {PANEL_VIEW_REGISTRY.map(({ id, labelKey, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={panelView === id}
          className="bottom-panel__tab"
          data-testid={`panel-tab-${id}`}
          // La ruedita cierra el panel entero y no la pestaña: las del panel
          // inferior no se pueden cerrar de a una —son tres fijas— así que
          // "cerrar esto" sólo puede significar una cosa.
          {...middleClickToClose(closePanel)}
          onClick={() => {
            showPanel(id);
          }}
        >
          <Icon size={14} />
          {t(labelKey)}
        </button>
      ))}

      <PanelActions panelView={panelView} />

      <button
        type="button"
        className="bottom-panel__close"
        aria-label={t('panel.hide')}
        title={t('panel.hide')}
        data-testid="panel-close"
        onClick={closePanel}
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}

/**
 * Los controles propios del inquilino visible, si aporta alguno.
 *
 * El único que hoy los aporta es la terminal, con su tira de sesiones. Va por
 * el descriptor y no con un `if` sobre el id acá adentro, porque eso sería que
 * el panel conozca a uno de sus inquilinos — que es exactamente lo que el
 * registro existe para evitar.
 */
function PanelActions({ panelView }: { panelView: PanelView }): React.JSX.Element | null {
  const descriptor = PANEL_VIEW_REGISTRY.find((panel) => panel.id === panelView);

  if (descriptor?.Actions === undefined) return null;

  return <descriptor.Actions />;
}
