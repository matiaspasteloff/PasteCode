import { useEffect } from 'react';

import { StatusBar } from './components/StatusBar.js';
import { ConflictDialog } from './features/editor/ConflictDialog.js';
import { EditorArea } from './features/editor/EditorArea.js';
import { OpenFileBar } from './features/editor/OpenFileBar.js';
import { useSaveShortcut } from './features/editor/use-save-shortcut.js';
import { FileTree } from './features/file-tree/FileTree.js';
import { WorkspaceHeader } from './features/workspace/WorkspaceHeader.js';
import { useEditorStore } from './stores/editor-store.js';
import { useFileTreeStore } from './stores/file-tree-store.js';
import { useWorkspaceStore } from './stores/workspace-store.js';

/**
 * Cascarón de la aplicación: barra lateral, área de edición y barra de estado.
 */
export function App(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const restore = useWorkspaceStore((state) => state.restore);
  const loadRoot = useFileTreeStore((state) => state.loadRoot);
  const clearTree = useFileTreeStore((state) => state.clear);

  const openFilePath = useEditorStore((state) => state.file?.path ?? null);
  const openFile = useEditorStore((state) => state.open);
  const closeFile = useEditorStore((state) => state.close);

  useSaveShortcut();

  useEffect(() => {
    // El main puede tener un workspace abierto de antes que la ventana se
    // recargara. Preguntar es más barato que asumir que no hay ninguno.
    void restore();
  }, [restore]);

  useEffect(() => {
    closeFile();

    if (workspace === null) clearTree();
    else void loadRoot(workspace.root);
  }, [workspace, loadRoot, clearTree, closeFile]);

  return (
    <div className="app">
      <aside className="sidebar">
        <WorkspaceHeader />
        {workspace !== null && (
          <FileTree
            selectedPath={openFilePath}
            onSelectFile={(path) => {
              void openFile(path);
            }}
          />
        )}
      </aside>

      <main className="editor-area">
        <OpenFileBar />
        <EditorArea />
      </main>

      <StatusBar />
      <ConflictDialog />
    </div>
  );
}
