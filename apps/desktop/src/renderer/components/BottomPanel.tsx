import { t } from '../i18n/index.js';
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
 *
 * Hoy el registro tiene **una sola** entrada, así que las comparaciones contra
 * `panelView` son tautológicas para el compilador y hay que silenciar la regla
 * que lo señala. Es deliberado y temporal: la segunda entrada es el panel de
 * problemas, que llega en cuanto el LSP produzca diagnósticos. La alternativa
 * —esperar a tener dos inquilinos para escribir el contenedor— dejaría a la
 * terminal decidiendo si se ve, que es exactamente lo que este PR viene a
 * sacarle.
 */
export function BottomPanel(): React.JSX.Element | null {
  const panelView = useViewStore((state) => state.panelView);
  const showPanel = useViewStore((state) => state.showPanel);
  const closePanel = useViewStore((state) => state.closePanel);

  if (panelView === null) return null;

  return (
    <section className="bottom-panel" aria-label={t('panel.label')}>
      <div className="bottom-panel__tabs" role="tablist" aria-label={t('panel.tabs')}>
        {PANEL_VIEW_REGISTRY.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- El registro tiene una entrada hasta que llegue el panel de problemas; ver el comentario del componente.
            aria-selected={panelView === id}
            className="bottom-panel__tab"
            data-testid={`panel-tab-${id}`}
            onClick={() => {
              showPanel(id);
            }}
          >
            <Icon size={14} />
            {t(labelKey)}
          </button>
        ))}

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

      {PANEL_VIEW_REGISTRY.map(({ id, render }) => (
        <div
          key={id}
          className="bottom-panel__body"
          role="tabpanel"
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Ídem: con dos inquilinos deja de ser tautológico.
          hidden={panelView !== id}
          data-testid={`panel-body-${id}`}
        >
          {render()}
        </div>
      ))}
    </section>
  );
}
