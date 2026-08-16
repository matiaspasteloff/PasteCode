import { activeTab } from '@pastecode/core';

import { FileTree } from '../features/file-tree/FileTree.js';
import { SearchPanel } from '../features/search/SearchPanel.js';
import { WorkspaceHeader } from '../features/workspace/WorkspaceHeader.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useSearchStore } from '../stores/search-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';

/**
 * La barra lateral: el encabezado del workspace y, debajo, el árbol o la
 * búsqueda.
 *
 * **Alterna en vez de partirse en dos.** Con los 16rem de `--sidebar-width`,
 * mostrar el árbol y la búsqueda a la vez deja a los dos inservibles, y es el
 * mismo criterio que usa cualquier editor con barra de actividades.
 */
export function Sidebar(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const activePath = useEditorStore((state) => activeTab(state.tabs)?.path ?? null);
  const openFile = useEditorStore((state) => state.open);
  const isSearchOpen = useSearchStore((state) => state.isPanelOpen);

  return (
    <aside className="sidebar">
      <WorkspaceHeader />

      {workspace !== null &&
        (isSearchOpen ? (
          <SearchPanel />
        ) : (
          <FileTree
            selectedPath={activePath}
            onSelectFile={(path) => {
              void openFile(path);
            }}
          />
        ))}
    </aside>
  );
}
