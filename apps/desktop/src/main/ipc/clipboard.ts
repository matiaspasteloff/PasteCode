import {
  ReadClipboardRequestSchema,
  WriteClipboardRequestSchema,
} from '@pastecode/ipc-contract';
import { clipboard } from 'electron';

import { registerHandler } from './handler.js';

/**
 * Registra los handlers del dominio `clipboard`.
 *
 * Existen para [RF-304](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada):
 * `Ctrl+Shift+C` y `Ctrl+Shift+V` en la terminal. El editor no los necesita
 * —Monaco usa el `Ctrl+C` nativo del navegador—, pero en una terminal esa
 * combinación es la señal de interrupción y no se la puede robar.
 *
 * Sólo texto plano. Lo que se copia de una terminal es texto; aceptar HTML o
 * imágenes sería superficie de ataque a cambio de nada.
 *
 * @example
 * registerClipboardIpcHandlers(); // antes de app.whenReady()
 */
export function registerClipboardIpcHandlers(): void {
  registerHandler('clipboard:readText', ReadClipboardRequestSchema, () => ({
    text: clipboard.readText(),
  }));

  registerHandler('clipboard:writeText', WriteClipboardRequestSchema, (payload) => {
    clipboard.writeText(payload.text);

    return {};
  });
}
