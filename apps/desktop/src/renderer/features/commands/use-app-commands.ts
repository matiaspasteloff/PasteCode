import type { Command } from '@pastecode/core';
import { useEffect } from 'react';

import { useCommandStore } from '../../stores/command-store.js';
import { activeGroupId, selectActiveTabs, useEditorStore } from '../../stores/editor-store.js';
import { useThemeStore } from '../../stores/theme-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { fileCommands } from '../files/file-commands.js';
import { gitCommands } from '../git/git-commands.js';
import { searchCommands } from '../search/search-commands.js';
import { terminalCommands } from '../terminal/terminal-commands.js';
import { viewCommands } from '../workspace/view-commands.js';

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
  const unregister = useCommandStore((state) => state.unregister);

  useEffect(() => {
    const commands = appCommands();

    for (const command of commands) register(command);

    // La baja no es higiene opcional: `StrictMode` monta el efecto, lo
    // desmonta y lo vuelve a montar en desarrollo justo para sacar a la luz
    // los efectos que no se pueden repetir. Sin esto, el segundo montaje
    // vuelve a registrar `workspace.open`, el registro lanza
    // `DuplicateCommandError` —registrar dos veces es un error a propósito— y
    // la app queda en blanco. En producción no pasaba, así que el bug sólo se
    // veía con `pnpm dev`.
    return () => {
      for (const command of commands) unregister(command.id);
    };
  }, [register, unregister]);
}

/**
 * Los comandos del cascarón, los que no son de ninguna feature en particular,
 * más los que cada feature aporta.
 *
 * Es una función y no una constante de módulo porque los handlers leen los
 * stores en el momento de construirse: evaluarla al importar el módulo los
 * ataría al estado inicial.
 *
 * @returns Los comandos, listos para registrar.
 */
function appCommands(): readonly Command[] {
  // `getState()` y no el hook: el registro corre una sola vez y las acciones
  // de Zustand son estables, así que suscribirse sólo agregaría re-renders.
  const openWorkspace = useWorkspaceStore.getState().open;
  const editor = useEditorStore.getState();

  return [
    {
      id: 'workspace.open',
      title: 'command.workspaceOpen',
      handler: () => openWorkspace(),
    },
    {
      id: 'file.save',
      title: 'command.fileSave',
      handler: () => useEditorStore.getState().save(),
    },
    {
      id: 'file.closeTab',
      title: 'command.fileCloseTab',
      handler: () => {
        const state = useEditorStore.getState();
        const tabs = selectActiveTabs(state);

        if (tabs.activeTabIndex !== -1) {
          state.closeTab(activeGroupId(state), tabs.activeTabIndex);
        }
      },
    },
    {
      id: 'view.cycleTheme',
      title: 'command.viewCycleTheme',
      handler: () => {
        useThemeStore.getState().cycleTheme();
      },
    },
    {
      id: 'file.closeAll',
      title: 'command.fileCloseAll',
      handler: editor.closeAll,
    },
    ...terminalCommands(),
    ...searchCommands(),
    ...gitCommands(),
    ...fileCommands(),
    ...viewCommands(),
  ];
}
