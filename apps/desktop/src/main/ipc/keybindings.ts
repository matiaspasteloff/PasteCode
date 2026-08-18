import { join } from 'node:path';

import type { KeybindingsChangedEvent } from '@pastecode/ipc-contract';
import { GetKeybindingsRequestSchema } from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import type { KeybindingsState } from '../services/keybindings.js';
import { currentKeybindings, initializeKeybindings } from '../services/keybindings.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/** Arma el payload que comparten el canal y el evento. */
function payloadFor(state: KeybindingsState): KeybindingsChangedEvent {
  return {
    bindings: state.bindings,
    conflicts: state.conflicts.map((conflict) => ({
      key: conflict.key,
      commands: [...conflict.commands],
    })),
    error:
      state.error === undefined
        ? null
        : { code: state.error.code, userMessage: state.error.userMessage },
  };
}

/**
 * Manda los atajos a todas las ventanas.
 *
 * Es la recarga en caliente de [RF-702](../../../../../docs/03-requerimientos-funcionales.md):
 * editar `~/.pastecode/keybindings.json` con la app abierta cambia el atajo sin
 * reiniciar nada.
 */
function broadcast(state: KeybindingsState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'keybindings:changed', payloadFor(state));
  }
}

/**
 * Arranca el servicio de keybindings y lo deja emitiendo.
 *
 * @param dataDirectory Directorio alternativo, para el E2E.
 * @example
 * void app.whenReady().then(() => startKeybindings());
 */
export async function startKeybindings(dataDirectory?: string): Promise<void> {
  await initializeKeybindings({
    onChange: broadcast,
    ...(dataDirectory === undefined
      ? {}
      : { userPath: join(dataDirectory, 'keybindings.json') }),
  });
}

/**
 * Registra los handlers del dominio `keybindings`.
 *
 * @example
 * registerKeybindingsIpcHandlers(); // antes de app.whenReady()
 */
export function registerKeybindingsIpcHandlers(): void {
  registerHandler('keybindings:get', GetKeybindingsRequestSchema, () =>
    payloadFor(currentKeybindings())
  );
}
