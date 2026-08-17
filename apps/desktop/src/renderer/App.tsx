import { useEffect } from 'react';

import { ActivityBar } from './components/ActivityBar.js';
import { BottomPanel } from './components/BottomPanel.js';
import { SideView } from './components/SideView.js';
import { StatusBar } from './components/StatusBar.js';
import { TitleToolbar } from './components/TitleToolbar.js';
import { CommandPalette } from './features/commands/CommandPalette.js';
import { useAppCommands } from './features/commands/use-app-commands.js';
import { useKeybindings } from './features/commands/use-keybindings.js';
import { ConflictDialog } from './features/editor/ConflictDialog.js';
import { EditorArea } from './features/editor/EditorArea.js';
import { releaseModelsExcept } from './features/editor/model-registry.js';
import { TabStrip } from './features/editor/TabStrip.js';
import { useExternalChanges } from './features/editor/use-external-changes.js';
import { FilePalette } from './features/files/FilePalette.js';
import { BranchPicker } from './features/git/BranchPicker.js';
import { useGitEvents } from './features/git/use-git-events.js';
import { useLsp } from './features/lsp/use-lsp.js';
import { useSearchEvents } from './features/search/use-search-events.js';
import { useSession } from './features/session/use-session.js';
import { useSettings } from './features/settings/use-settings.js';
import { useTheme } from './features/theme/use-theme.js';
import { useWorkspaceReset } from './features/workspace/use-workspace-reset.js';
import { useEditorStore } from './stores/editor-store.js';
import { useWorkspaceStore } from './stores/workspace-store.js';

/**
 * Cascarón de la aplicación: toolbar, rail de vistas, barra lateral, área de
 * edición con su panel inferior, y barra de estado.
 */
export function App(): React.JSX.Element {
  const restore = useWorkspaceStore((state) => state.restore);
  const openTabs = useEditorStore((state) => state.tabs.tabs);

  useAppCommands();
  useKeybindings();
  useSettings();
  useSession();
  useSearchEvents();
  useExternalChanges();
  useLsp();
  useGitEvents();
  useTheme();
  useWorkspaceReset();

  useEffect(() => {
    // El main puede tener un workspace abierto de antes que la ventana se
    // recargara. Preguntar es más barato que asumir que no hay ninguno.
    void restore();
  }, [restore]);

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
      <TitleToolbar />
      <ActivityBar />
      <SideView />

      <main className="editor-area">
        <TabStrip />
        <EditorArea />
        <BottomPanel />
      </main>

      <StatusBar />
      <ConflictDialog />
      <CommandPalette />
      <FilePalette />
      <BranchPicker />
    </div>
  );
}
