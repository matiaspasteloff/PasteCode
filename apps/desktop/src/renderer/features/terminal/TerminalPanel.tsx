import { useEffect } from 'react';

import { t } from '../../i18n/index.js';
import { useTerminalStore } from '../../stores/terminal-store.js';

import { TerminalTabs } from './TerminalTabs.js';
import { useTerminal } from './use-terminal.js';

/** Tamaño con el que se crea una sesión antes de que xterm mida el panel. */
const INITIAL_DIMENSIONS = { cols: 80, rows: 24 };

/** Una sesión: su instancia de xterm, montada aunque esté oculta. */
function TerminalSurface({
  sessionId,
  isVisible,
}: {
  sessionId: string;
  isVisible: boolean;
}): React.JSX.Element {
  const hostRef = useTerminal(sessionId, isVisible);

  // Se esconde con `hidden` y no desmontando: desmontar tiraría el scrollback
  // de xterm, así que cambiar de pestaña y volver perdería todo lo que la
  // terminal había escrito.
  return (
    <div
      ref={hostRef}
      className="terminal-panel__surface"
      hidden={!isVisible}
      data-testid={`terminal-surface-${sessionId}`}
    />
  );
}

/**
 * El panel de terminales integradas ([RF-301 a RF-305](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)).
 *
 * Se suscribe a `terminal:exit` una sola vez para todo el panel y no una vez
 * por sesión: el evento dice a qué sesión pertenece, y una suscripción por
 * instancia significaría N listeners recibiendo N eventos cada uno.
 */
export function TerminalPanel(): React.JSX.Element | null {
  const sessions = useTerminalStore((state) => state.sessions);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const isPanelOpen = useTerminalStore((state) => state.isPanelOpen);
  const error = useTerminalStore((state) => state.error);
  const activate = useTerminalStore((state) => state.activate);
  const dispose = useTerminalStore((state) => state.dispose);
  const create = useTerminalStore((state) => state.create);
  const closePanel = useTerminalStore((state) => state.closePanel);
  const forget = useTerminalStore((state) => state.forget);

  useEffect(
    () =>
      window.pastecode.subscribe('terminal:exit', (event) => {
        forget(event.sessionId);
      }),
    [forget]
  );

  if (!isPanelOpen) return null;

  return (
    <section className="terminal-panel" aria-label={t('terminal.panel')}>
      <TerminalTabs
        sessions={sessions}
        activeSessionId={activeSessionId}
        onActivate={activate}
        onDispose={(sessionId) => {
          void dispose(sessionId);
        }}
        onCreate={() => {
          void create(INITIAL_DIMENSIONS);
        }}
        onClosePanel={closePanel}
      />

      {error !== null && (
        <p className="terminal-panel__error" role="alert">
          {error.userMessage}
        </p>
      )}

      {sessions.map((session) => (
        <TerminalSurface
          key={session.sessionId}
          sessionId={session.sessionId}
          isVisible={session.sessionId === activeSessionId}
        />
      ))}
    </section>
  );
}
