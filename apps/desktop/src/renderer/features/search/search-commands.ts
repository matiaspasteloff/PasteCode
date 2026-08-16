import type { Command } from '@pastecode/core';

import { useViewStore } from '../../stores/view-store.js';

/**
 * Los comandos de la búsqueda.
 *
 * Mismo criterio que los de la terminal: la feature es dueña de sus acciones y
 * `use-app-commands` sólo enumera dominios.
 *
 * Desde el paso 26½ el que alterna la vista es `view-store` y no un booleano
 * adentro de `search-store`: mostrar la búsqueda es ruteo del cascarón, no
 * estado de la búsqueda. Ver [ADR-0022](../../../../../../docs/adr/0022-cascaron-con-barra-de-actividades.md).
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
        useViewStore.getState().toggleSide('search');
      },
    },
  ];
}
