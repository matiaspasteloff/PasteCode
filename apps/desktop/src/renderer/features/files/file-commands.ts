import type { Command } from '@pastecode/core';

import { useFileIndexStore } from '../../stores/file-index-store.js';

/**
 * Los comandos del quick open.
 *
 * `Ctrl+P` es un comando registrado y no un handler suelto, igual que todo lo
 * demás: es lo que hace que aparezca en la paleta con su atajo al lado y que
 * una extensión lo pueda invocar en la Etapa 5.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of fileCommands()) register(command);
 */
export function fileCommands(): readonly Command[] {
  return [
    {
      id: 'files.quickOpen',
      title: 'command.filesQuickOpen',
      handler: () => useFileIndexStore.getState().open(),
    },
  ];
}
