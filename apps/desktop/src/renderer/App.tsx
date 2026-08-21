import { allOpenPaths } from '@pastecode/core';
import { useEffect } from 'react';

import { ActivityBar } from './components/ActivityBar.js';
import { BottomPanel } from './components/BottomPanel.js';
import { SideView } from './components/SideView.js';
import { StatusBar } from './components/StatusBar.js';
import { TitleToolbar } from './components/TitleToolbar.js';
import { ApiKeyDialog } from './features/ai/ApiKeyDialog.js';
import { useAiEvents } from './features/ai/use-ai-events.js';
import { CommandPalette } from './features/commands/CommandPalette.js';
import { useAppCommands } from './features/commands/use-app-commands.js';
import { useKeybindings } from './features/commands/use-keybindings.js';
import { useBreakpoints } from './features/debug/use-breakpoints.js';
import { useDebugEvents } from './features/debug/use-debug-events.js';
import { ConflictDialog } from './features/editor/ConflictDialog.js';
import { EditorArea } from './features/editor/EditorArea.js';
import { releaseModelsExcept } from './features/editor/model-registry.js';
import { RecoveryDialog } from './features/editor/RecoveryDialog.js';
import { useBackups } from './features/editor/use-backups.js';
import { useExternalChanges } from './features/editor/use-external-changes.js';
import { useExtensions } from './features/extensions/use-extensions.js';
import { DeleteDialog } from './features/file-tree/DeleteDialog.js';
import { FilePalette } from './features/files/FilePalette.js';
import { BranchPicker } from './features/git/BranchPicker.js';
import { useGitEvents } from './features/git/use-git-events.js';
import { useGutter } from './features/git/use-gutter.js';
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
  const groups = useEditorStore((state) => state.groups);

  useAppCommands();
  useAiEvents();
  useKeybindings();
  useSettings();
  useSession();
  useSearchEvents();
  useExternalChanges();
  useBackups();
  useLsp();
  useExtensions();
  useGitEvents();
  useGutter();
  useBreakpoints();
  useDebugEvents();
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
    // `allOpenPaths` y no las pestañas de un grupo: **es el bug número uno de
    // esta feature**. Con dos paneles, liberar por grupo desecharía el modelo
    // que el otro está mostrando, y Monaco tira al siguiente render.
    releaseModelsExcept(allOpenPaths(groups));
  }, [groups]);

  return (
    <div className="app">
      <TitleToolbar />
      <ActivityBar />
      <SideView />

      <main className="editor-area">
        <EditorArea />
        <BottomPanel />
      </main>

      <StatusBar />
      <ConflictDialog />
      <DeleteDialog />
      <RecoveryDialog />
      <CommandPalette />
      <FilePalette />
      <BranchPicker />
      <ApiKeyDialog />
    </div>
  );
}
