import type { Command, UpdateState } from '@pastecode/core';
import type { ChannelName, IpcResult } from '@pastecode/ipc-contract';

import { useUpdateStore } from '../../stores/update-store.js';

/** Guarda el estado que devolvió un canal, si salió bien. */
function keep(result: IpcResult<UpdateState>): void {
  if (result.ok) useUpdateStore.getState().setState(result.value);
}

/** Invoca un canal sin payload ni respuesta que importe. */
async function fire(
  channel: Extract<ChannelName, 'update:install' | 'update:openReleasePage'>
) {
  await window.pastecode.invoke(channel, {});
}

/**
 * Los comandos de actualización de la app.
 *
 * Son **la única forma** de descargar e instalar: la status bar los dispara al
 * hacer clic, la paleta los lista, y ningún otro camino del renderer llama a
 * `update:download` ni a `update:install` (ADR-0034). Cada uno le pide al main
 * y se queda con el estado que le devuelve; los pasos intermedios —el
 * porcentaje de la descarga— llegan por `update:stateChanged`.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of updateCommands()) register(command);
 */
export function updateCommands(): readonly Command[] {
  return [
    {
      id: 'app.checkForUpdates',
      title: 'command.appCheckForUpdates',
      handler: async () => {
        useUpdateStore.getState().markRequested();
        keep(await window.pastecode.invoke('update:check', {}));
      },
    },
    {
      id: 'app.downloadUpdate',
      title: 'command.appDownloadUpdate',
      handler: async () => {
        keep(await window.pastecode.invoke('update:download', {}));
      },
    },
    {
      id: 'app.installUpdate',
      title: 'command.appInstallUpdate',
      handler: () => fire('update:install'),
    },
    {
      id: 'app.openReleasePage',
      title: 'command.appOpenReleasePage',
      handler: () => fire('update:openReleasePage'),
    },
  ];
}
