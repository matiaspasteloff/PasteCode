import { useEffect } from 'react';

import { ActivityBar } from './components/ActivityBar.js';
import { SideView } from './components/SideView.js';
import { StatusBar } from './components/StatusBar.js';
import { CommandPalette } from './features/commands/CommandPalette.js';
import { useAppCommands } from './features/commands/use-app-commands.js';
import { useKeybindings } from './features/commands/use-keybindings.js';
import { ConflictDialog } from './features/editor/ConflictDialog.js';
import { EditorArea } from './features/editor/EditorArea.js';
import { releaseAllModels, releaseModelsExcept } from './features/editor/model-registry.js';
import { TabStrip } from './features/editor/TabStrip.js';
import { FilePalette } from './features/files/FilePalette.js';
import { useSearchEvents } from './features/search/use-search-events.js';
import { useSession } from './features/session/use-session.js';
import { useSettings } from './features/settings/use-settings.js';
import { TerminalPanel } from './features/terminal/TerminalPanel.js';
import { useTheme } from './features/theme/use-theme.js';
import { useEditorStore } from './stores/editor-store.js';
import { useFileIndexStore } from './stores/file-index-store.js';
import { useFileTreeStore } from './stores/file-tree-store.js';
import { useWorkspaceStore } from './stores/workspace-store.js';

/**
 * Cascarón de la aplicación: rail de vistas, barra lateral, área de edición y
 * barra de estado.
 */
export function App(): React.JSX.Element {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const restore = useWorkspaceStore((state) => state.restore);
  const loadRoot = useFileTreeStore((state) => state.loadRoot);
  const clearTree = useFileTreeStore((state) => state.clear);
  const clearIndex = useFileIndexStore((state) => state.clear);

  const openTabs = useEditorStore((state) => state.tabs.tabs);
  const closeAll = useEditorStore((state) => state.closeAll);

  useAppCommands();
  useKeybindings();
  useSettings();
  useSession();
  useSearchEvents();
  useTheme();

  useEffect(() => {
    // El main puede tener un workspace abierto de antes que la ventana se
    // recargara. Preguntar es más barato que asumir que no hay ninguno.
    void restore();
  }, [restore]);

  useEffect(() => {
    // Cambiar de workspace cierra todo. Los modelos se desechan a mano: no los
    // recoge el recolector de basura mientras Monaco los tenga indexados.
    closeAll();
    releaseAllModels();
    // El índice de quick open es de un workspace: conservarlo ofrecería
    // archivos de la carpeta anterior.
    clearIndex();

    if (workspace === null) clearTree();
    else void loadRoot(workspace.root);
  }, [workspace, loadRoot, clearTree, clearIndex, closeAll]);

  useEffect(() => {
    // El registro se acomoda a las pestañas abiertas. Va acá y no en el editor
    // porque al cerrar la última pestaña el editor se desmonta, y entonces su
    // efecto ya no correría justo cuando hay algo que liberar. Un modelo que
    // sobrevive al cierre no sólo ocupa memoria (RNF-04): al reabrir el
    // archivo se devolvería ese modelo viejo en vez de leer el disco.
    releaseModelsExcept(openTabs.map((tab) => tab.path));
  }, [openTabs]);

  return (
    <div className="app">
      <ActivityBar />
      <SideView />

      <main className="editor-area">
        <TabStrip />
        <EditorArea />
        <TerminalPanel />
      </main>

      <StatusBar />
      <ConflictDialog />
      <CommandPalette />
      <FilePalette />
    </div>
  );
}
