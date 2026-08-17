import type { Command } from '@pastecode/core';

import { useGitStore } from '../../stores/git-store.js';
import { useViewStore } from '../../stores/view-store.js';

/**
 * Los comandos de Git.
 *
 * Mismo criterio que los de la búsqueda y la terminal: la feature es dueña de
 * sus acciones y `use-app-commands` sólo enumera dominios.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of gitCommands()) register(command);
 */
export function gitCommands(): readonly Command[] {
  return [
    {
      id: 'git.toggle',
      title: 'command.gitToggle',
      handler: () => {
        useViewStore.getState().toggleSide('git');
      },
    },
    {
      id: 'git.checkoutBranch',
      title: 'command.gitCheckoutBranch',
      handler: () => useGitStore.getState().openBranchPicker(),
    },
  ];
}
