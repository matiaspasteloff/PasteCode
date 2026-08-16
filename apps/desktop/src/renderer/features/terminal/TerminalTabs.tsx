import type { TerminalSession } from '@pastecode/ipc-contract';

import { t } from '../../i18n/index.js';

interface TerminalTabsProps {
  sessions: readonly TerminalSession[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onDispose: (sessionId: string) => void;
  onCreate: () => void;
  onClosePanel: () => void;
}

/**
 * El dropdown de sesiones de [RF-302](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada),
 * resuelto como una tira de pestañas.
 *
 * Una tira y no un `<select>`: con dos o tres terminales —que es el caso
 * normal— un desplegable esconde detrás de un click lo que entra de sobra en
 * la barra, y cerrar una sesión desde adentro de un `<select>` no se puede.
 */
export function TerminalTabs({
  sessions,
  activeSessionId,
  onActivate,
  onDispose,
  onCreate,
  onClosePanel,
}: TerminalTabsProps): React.JSX.Element {
  return (
    <div className="terminal-tabs">
      <ul className="terminal-tabs__list" aria-label={t('terminal.sessions')}>
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              className="terminal-tabs__tab"
              aria-current={session.sessionId === activeSessionId}
              onClick={() => {
                onActivate(session.sessionId);
              }}
            >
              {session.displayName}
            </button>
            <button
              type="button"
              className="terminal-tabs__close"
              aria-label={`${t('terminal.close')} ${session.displayName}`}
              onClick={() => {
                onDispose(session.sessionId);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="terminal-tabs__actions">
        <button type="button" aria-label={t('terminal.create')} onClick={onCreate}>
          +
        </button>
        <button type="button" aria-label={t('terminal.hidePanel')} onClick={onClosePanel}>
          ▾
        </button>
      </div>
    </div>
  );
}
