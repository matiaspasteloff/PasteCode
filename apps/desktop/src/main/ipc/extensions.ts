import type { ExtensionHostChangedEvent, Response } from '@pastecode/ipc-contract';
import { GetExtensionHostStatusRequestSchema } from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import type { ExtensionHostService } from '../extensions/host-process.js';
import { createExtensionHostService } from '../extensions/host-process.js';
import { registerDisposer } from '../services/shutdown.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * El host de esta corrida.
 *
 * Es estado de módulo por lo mismo que en `settings` y `keybindings`: hay uno
 * solo por proceso y su ciclo de vida es el de la app. Vive acá y no en
 * `index.ts` para que el arranque no tenga que saber cómo se cablea un evento.
 */
let service: ExtensionHostService | null = null;

/** Manda el estado del host a todas las ventanas. */
function broadcast(status: ExtensionHostChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'extensions:hostChanged', status);
  }
}

/** El estado de ahora, o uno apagado si todavía no arrancó. */
function currentStatus(): ExtensionHostChangedEvent {
  return service?.status() ?? { state: 'gaveUp', pid: null, restarts: 0 };
}

/**
 * Registra los handlers del dominio `extensions`.
 *
 * @example
 * registerExtensionsIpcHandlers(); // antes de app.whenReady()
 */
export function registerExtensionsIpcHandlers(): void {
  registerHandler(
    'extensions:getStatus',
    GetExtensionHostStatusRequestSchema,
    (): Response<'extensions:getStatus'> => currentStatus()
  );
}

/**
 * Levanta el extension host y lo deja supervisándose solo.
 *
 * Que el host se caiga —o que se rinda después de los tres intentos de
 * [RNF-09](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)—
 * no toca nada del resto del main: el IDE sigue vivo sin extensiones, que es
 * exactamente lo que pide [RF-907](../../../../../docs/03-requerimientos-funcionales.md).
 *
 * @example
 * startExtensionHost(); // dentro de app.whenReady()
 */
export function startExtensionHost(): void {
  service = createExtensionHostService({ onStatusChanged: broadcast });

  registerDisposer('extension-host', () => service?.stop() ?? Promise.resolve());
  service.start();
}
