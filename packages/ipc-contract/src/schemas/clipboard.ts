import { z } from 'zod';

/**
 * Payload de `clipboard:readText`.
 *
 * El portapapeles va por IPC y no por `navigator.clipboard` a propósito. La
 * API del navegador necesita un contexto seguro **y** que el manejador de
 * permisos de Electron conceda `clipboard-read`, así que su disponibilidad
 * depende de dos cosas que se configuran lejos de acá y que un cambio futuro
 * puede romper sin que nada avise. El módulo `clipboard` de Electron es del
 * main, no pide permisos y se comporta igual en las tres plataformas.
 */
export const ReadClipboardRequestSchema = z.strictObject({});

/** Respuesta de `clipboard:readText`: el texto, o vacío si no hay. */
export const ReadClipboardResponseSchema = z.strictObject({
  text: z.string(),
});

/** Payload de `clipboard:writeText`. */
export const WriteClipboardRequestSchema = z.strictObject({
  text: z.string(),
});

/** Respuesta de `clipboard:writeText`. */
export const WriteClipboardResponseSchema = z.strictObject({});
