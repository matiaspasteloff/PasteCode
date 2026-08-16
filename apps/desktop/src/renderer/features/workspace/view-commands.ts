import type { Command } from '@pastecode/core';

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
      id: 'view.showExplorer',
      title: 'command.viewShowExplorer',
      handler: () => {
        useViewStore.getState().toggleSide('explorer');
      },
    },
  ];
}
