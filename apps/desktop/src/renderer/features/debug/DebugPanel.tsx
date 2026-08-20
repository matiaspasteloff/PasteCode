import { t } from '../../i18n/index.js';
import { useDebugStore } from '../../stores/debug-store.js';

import { DebugConsole } from './DebugConsole.js';
import { DebugToolbar } from './DebugToolbar.js';
import { DebugVariables } from './DebugVariables.js';

/**
 * El panel de depuración: controles, pila, variables y consola.
 *
 * Es **una pestaña más del panel inferior**, registrada en `panel-registry`
 * igual que la terminal y los problemas. El panel no conoce a sus inquilinos,
 * los recorre; que el debugging entre como una entrada más es la misma prueba
 * que ya pasó el panel de problemas.
 *
 * Las tres partes están una al lado de la otra y no en pestañas anidadas: con
 * una sesión frenada, mirar una variable y la pila al mismo tiempo es
 * exactamente lo que se hace, y esconder una detrás de la otra obligaría a ir
 * y volver en el momento de menos paciencia.
 */
export function DebugPanel(): React.JSX.Element {
  const state = useDebugStore((store) => store.status.state);
  const userMessage = useDebugStore((store) => store.status.userMessage);

  if (state === 'unavailable') {
    return (
      <div className="debug-panel debug-panel--empty" data-testid="debug-unavailable">
        {userMessage ?? t('debug.noSession')}
      </div>
    );
  }

  return (
    <div className="debug-panel">
      <DebugToolbar />

      <div className="debug-panel__columns">
        <section className="debug-panel__column" aria-label={t('debug.callStack')}>
          <h3 className="debug-panel__title">{t('debug.callStack')}</h3>
          <CallStack />
        </section>

        <section className="debug-panel__column" aria-label={t('debug.variables')}>
          <h3 className="debug-panel__title">{t('debug.variables')}</h3>
          <DebugVariables />
        </section>

        <section
          className="debug-panel__column debug-panel__column--wide"
          aria-label={t('debug.console')}
        >
          <h3 className="debug-panel__title">{t('debug.console')}</h3>
          <DebugConsole />
        </section>
      </div>
    </div>
  );
}

/**
 * La pila de llamadas del freno actual (RF-504).
 *
 * Elegir un frame cambia el contexto de las variables y de la consola, que es
 * para lo que sirve una pila: mirar desde dónde se llegó hasta acá.
 */
function CallStack(): React.JSX.Element {
  const frames = useDebugStore((store) => store.frames);
  const selectedFrameId = useDebugStore((store) => store.selectedFrameId);
  const selectFrame = useDebugStore((store) => store.selectFrame);

  return (
    <ul className="debug-stack" data-testid="debug-stack">
      {frames.map((frame) => (
        <li key={frame.id}>
          <button
            type="button"
            className={`debug-stack__frame${
              frame.id === selectedFrameId ? ' debug-stack__frame--active' : ''
            }`}
            aria-current={frame.id === selectedFrameId}
            onClick={() => {
              selectFrame(frame.id);
            }}
          >
            <span className="debug-stack__name">{frame.name}</span>
            {/* Un frame de código nativo no tiene archivo: se muestra sin línea
                en vez de con un cero que parece una ubicación. */}
            {frame.path !== null && <span className="debug-stack__line">:{frame.line}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
