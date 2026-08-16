import type { Command } from '@pastecode/core';

import { useSearchStore } from '../../stores/search-store.js';

/**
 * Los comandos de la búsqueda.
 *
 * Mismo criterio que los de la terminal: la feature es dueña de sus acciones y
 * `use-app-commands` sólo enumera dominios.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of searchCommands()) register(command);
 */
export function searchCommands(): readonly Command[] {
  return [
    {
      id: 'search.toggle',
      title: 'command.searchToggle',
      handler: () => {
        useSearchStore.getState().togglePanel();
      },
    },
  ];
}
