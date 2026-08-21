import type { Command } from '@pastecode/core';
import { PRIMARY_GROUP_ID, SECONDARY_GROUP_ID } from '@pastecode/core';

import { useEditorStore } from '../../stores/editor-store.js';
import { useThemeStore } from '../../stores/theme-store.js';
import { useViewStore } from '../../stores/view-store.js';

/**
 * Los comandos del cascarón: qué vista lateral está a la vista.
 *
 * Existen porque el rail **dispara comandos y no acciones del store**. Llamar a
 * `toggleSide` directo desde el botón sería una línea menos y dejaría dos
 * caminos para mostrar el explorador —el botón y el atajo— que pueden divergir.
 * El paso 17 refactorizó todo lo demás para que pasara por el registro; esto es
 * lo mismo.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of viewCommands()) register(command);
 */
export function viewCommands(): readonly Command[] {
  return [
    {
      id: 'editor.splitRight',
      title: 'command.editorSplitRight',
      handler: () => {
        useEditorStore.getState().splitEditor('horizontal');
      },
    },
    {
      id: 'editor.splitDown',
      title: 'command.editorSplitDown',
      handler: () => {
        useEditorStore.getState().splitEditor('vertical');
      },
    },
    {
      id: 'editor.focusFirstGroup',
      title: 'command.editorFocusFirstGroup',
      handler: () => {
        useEditorStore.getState().focusGroup(PRIMARY_GROUP_ID);
      },
    },
    {
      id: 'editor.focusSecondGroup',
      title: 'command.editorFocusSecondGroup',
      handler: () => {
        useEditorStore.getState().focusGroup(SECONDARY_GROUP_ID);
      },
    },
    {
      id: 'view.showExplorer',
      title: 'command.viewShowExplorer',
      handler: () => {
        useViewStore.getState().toggleSide('explorer');
      },
    },
    {
      id: 'view.selectTheme',
      title: 'command.viewSelectTheme',
      handler: () => {
        useThemeStore.getState().openPicker();
      },
    },
    ...panelCommands(),
  ];
}

/**
 * Los comandos de los dos inquilinos del panel inferior que no tenían uno.
 *
 * La terminal ya tenía el suyo desde la Etapa 3; problemas y depuración sólo
 * se podían abrir clickeando su pestaña. Sin éstos, la barra de menús de
 * [ADR-0030](../../../../../../docs/adr/0030-barra-de-titulo-propia.md) no
 * tendría nada que ofrecer en Ver ni en Ejecutar — y ése es exactamente el
 * síntoma de que faltaban.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of panelCommands()) register(command);
 */
function panelCommands(): readonly Command[] {
  return [
    {
      id: 'problems.togglePanel',
      title: 'command.problemsTogglePanel',
      handler: () => {
        useViewStore.getState().togglePanel('problems');
      },
    },
    {
      id: 'debug.togglePanel',
      title: 'command.debugTogglePanel',
      handler: () => {
        useViewStore.getState().togglePanel('debug');
      },
    },
  ];
}
