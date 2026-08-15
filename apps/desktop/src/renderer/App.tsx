import { useEffect, useState } from 'react';

import { StatusBar } from './components/StatusBar.js';
import { FileTree } from './features/file-tree/FileTree.js';
import { WorkspaceHeader } from './features/workspace/WorkspaceHeader.js';
import { t } from './i18n/index.js';
import { useFileTreeStore } from './stores/file-tree-store.js';
import { useWorkspaceStore } from './stores/workspace-store.js';

/**
 * Cascarón de la aplicación: barra lateral, área de edición y barra de estado.
 *
 * La estructura ya es la definitiva aunque el área de edición todavía esté
 * vacía. Es más barato que armarla ahora y reacomodar todo cuando entre Monaco
 * en el PR siguiente.
 */
export function App(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const restore = useWorkspaceStore((state) => state.restore);
  const loadRoot = useFileTreeStore((state) => state.loadRoot);
  const clearTree = useFileTreeStore((state) => state.clear);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    // El main puede tener un workspace abierto de antes que la ventana se
    // recargara. Preguntar es más barato que asumir que no hay ninguno.
    void restore();
  }, [restore]);

  useEffect(() => {
    if (workspace === null) {
      clearTree();
      return;
    }

    setSelectedPath(null);
    void loadRoot(workspace.root);
  }, [workspace, loadRoot, clearTree]);

  return (
    <div className="app">
      <aside className="sidebar">
        <WorkspaceHeader />
        {workspace !== null && (
          <FileTree selectedPath={selectedPath} onSelectFile={setSelectedPath} />
        )}
      </aside>

      <main className="editor-area">
        {selectedPath === null && (
          <p className="editor-area__empty">{t('workspace.emptyDescription')}</p>
        )}
      </main>

      <StatusBar />
    </div>
  );
}
