import { useEffect } from 'react';

import { useCommandStore } from '../../stores/command-store.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useThemeStore } from '../../stores/theme-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { searchCommands } from '../search/search-commands.js';
import { terminalCommands } from '../terminal/terminal-commands.js';

/**
 * Registra los comandos de la aplicación.
 *
 * **Toda acción de la UI pasa a ser un comando registrado**, que es lo que
 * pide el paso 17 de la guía. No es burocracia: es lo que hace que la Etapa 5
 * no tenga que reescribir la UI para exponerle acciones a las extensiones, y
 * lo que le da a la paleta algo que listar sin una segunda tabla que mantener
 * en sincronía.
 *
 * Los `title` son claves de i18n y no texto: el registro es de
 * `packages/core`, que no sabe de idiomas, y quien lo muestra traduce.
 *
 * @example
 * useAppCommands(); // una vez, en el cascarón de la app
 */
export function useAppCommands(): void {
  const register = useCommandStore((state) => state.register);

  useEffect(() => {
    const openWorkspace = useWorkspaceStore.getState().open;
    const editor = useEditorStore.getState();

    // `getState()` y no el hook: el registro corre una sola vez y las acciones
    // de Zustand son estables, así que suscribirse sólo agregaría re-renders.
    register({
      id: 'workspace.open',
      title: 'command.workspaceOpen',
      handler: () => openWorkspace(),
    });

    register({
      id: 'file.save',
      title: 'command.fileSave',
      handler: () => useEditorStore.getState().save(),
    });

    register({
      id: 'file.closeTab',
      title: 'command.fileCloseTab',
      handler: () => {
        const { tabs, closeTab } = useEditorStore.getState();
        if (tabs.activeTabIndex !== -1) closeTab(tabs.activeTabIndex);
      },
    });

    register({
      id: 'view.cycleTheme',
      title: 'command.viewCycleTheme',
      handler: () => {
        useThemeStore.getState().cycleTheme();
      },
    });

    register({
      id: 'file.closeAll',
      title: 'command.fileCloseAll',
      handler: editor.closeAll,
    });

    for (const command of terminalCommands()) register(command);
    for (const command of searchCommands()) register(command);
  }, [register]);
}
