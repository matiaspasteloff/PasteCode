import { join } from 'node:path';

import type { Settings } from '@pastecode/core';
import type { SettingsChangedEvent } from '@pastecode/ipc-contract';
import { GetSettingsRequestSchema, UpdateSettingsRequestSchema } from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import {
  currentSettings,
  initializeSettings,
  settingsError,
  updateSettings,
} from '../services/settings.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * Arma el payload que comparten el canal y el evento.
 *
 * El error viaja al lado de las settings, no en lugar de ellas: un archivo
 * roto deja a la app andando con los últimos valores buenos **y** con algo que
 * mostrar (RNF-25).
 */
function payloadFor(settings: Settings): SettingsChangedEvent {
  const failure = settingsError();

  return {
    settings,
    error:
      failure === undefined ? null : { code: failure.code, userMessage: failure.userMessage },
  };
}

/**
 * Manda las settings resueltas a todas las ventanas.
 *
 * Es lo que hace posible la recarga en caliente de
 * [RF-704](../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración):
 * editar `~/.pastecode/settings.json` desde afuera de la app cambia el tamaño
 * de fuente sin reiniciar nada.
 */
function broadcast(settings: Settings): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'settings:changed', payloadFor(settings));
  }
}

/**
 * Arranca el servicio de settings y lo deja emitiendo.
 *
 * Se llama después de `app.whenReady()` y no al registrar los handlers porque
 * lee del disco, y el arranque de la ventana es lo que mide
 * [RNF-01](../../../../../docs/04-requerimientos-no-funcionales.md#performance).
 *
 * @example
 * void app.whenReady().then(() => startSettings());
 */
export async function startSettings(dataDirectory?: string): Promise<void> {
  await initializeSettings({
    onChange: broadcast,
    ...(dataDirectory === undefined ? {} : { userPath: join(dataDirectory, 'settings.json') }),
  });
}

/**
 * Registra los handlers del dominio `settings`.
 *
 * @example
 * registerSettingsIpcHandlers(); // antes de app.whenReady()
 */
export function registerSettingsIpcHandlers(): void {
  registerHandler('settings:get', GetSettingsRequestSchema, () =>
    payloadFor(currentSettings())
  );

  registerHandler('settings:update', UpdateSettingsRequestSchema, async (payload) =>
    payloadFor(await updateSettings(payload.scope, payload.settings))
  );
}
