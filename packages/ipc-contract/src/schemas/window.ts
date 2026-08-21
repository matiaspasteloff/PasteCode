import { z } from 'zod';

/**
 * Los canales de ventana existen porque desde [ADR-0030](../../../../docs/adr/0030-barra-de-titulo-propia.md)
 * la ventana no tiene marco: `frame: false`, y los tres botones los dibuja el
 * renderer.
 *
 * Van por IPC como todo lo demás y no por `remote` ni por una API expuesta en
 * el preload: el renderer no toca Electron, ni siquiera para minimizar.
 * `webPreferences` no cambió una coma.
 */

/** Payload de `window:minimize`. Hay una sola ventana; no hace falta decir cuál. */
export const MinimizeWindowRequestSchema = z.strictObject({});

/** Respuesta de `window:minimize`. */
export const MinimizeWindowResponseSchema = z.strictObject({});

/**
 * Payload de `window:toggleMaximize`.
 *
 * Uno solo y no un par maximizar/restaurar: el botón es el mismo y su acción
 * depende del estado, así que partirlo obligaría al renderer a decidir cuál
 * llamar con un estado que puede haber cambiado hace un milisegundo por un
 * arrastre al borde de la pantalla.
 */
export const ToggleMaximizeWindowRequestSchema = z.strictObject({});

/** Respuesta de `window:toggleMaximize`. */
export const ToggleMaximizeWindowResponseSchema = z.strictObject({});

/** Payload de `window:close`. Dispara el cierre ordenado de siempre. */
export const CloseWindowRequestSchema = z.strictObject({});

/** Respuesta de `window:close`. */
export const CloseWindowResponseSchema = z.strictObject({});

/** Payload de `window:isMaximized`. */
export const IsWindowMaximizedRequestSchema = z.strictObject({});

/**
 * Respuesta de `window:isMaximized`: el estado, al montar.
 *
 * Es **la pregunta**; `window:maximizedChanged` es el hecho. Hacen falta las
 * dos por lo mismo que `git:getStatus` y `git:changed`: la ventana puede estar
 * maximizada cuando el renderer recarga, y ahí no hay ningún hecho nuevo que
 * contar.
 */
export const IsWindowMaximizedResponseSchema = z.strictObject({
  isMaximized: z.boolean(),
});
