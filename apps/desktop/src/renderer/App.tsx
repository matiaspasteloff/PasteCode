import { useEffect } from 'react';

import { StatusBar } from './components/StatusBar.js';
import { WorkspaceHeader } from './features/workspace/WorkspaceHeader.js';
import { t } from './i18n/index.js';
import { useWorkspaceStore } from './stores/workspace-store.js';

/**
 * Cascarón de la aplicación: barra lateral, área de edición y barra de estado.
 *
 * La estructura ya es la definitiva aunque dos de los tres huecos estén
 * vacíos. Es más barato que armarla ahora y reacomodar todo cuando entren el
 * árbol (PR-4b) y Monaco (PR-5).
 */
export function App(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const restore = useWorkspaceStore((state) => state.restore);

  useEffect(() => {
    // El main puede tener un workspace abierto de antes que la ventana se
    // recargara. Preguntar es más barato que asumir que no hay ninguno.
    void restore();
  }, [restore]);

  return (
    <div className="app">
      <aside className="sidebar">
        <WorkspaceHeader />
      </aside>

      <main className="editor-area">
        {workspace === null && (
          <p className="editor-area__empty">{t('workspace.emptyDescription')}</p>
        )}
      </main>

      <StatusBar />
    </div>
  );
}
