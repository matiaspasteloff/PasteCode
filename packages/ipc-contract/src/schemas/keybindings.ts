import { z } from 'zod';

/** Un atajo resuelto, tal como el renderer lo consume. */
export const KeybindingSchema = z.strictObject({
  key: z.string().min(1),
  command: z.string().min(1),
  when: z.string().min(1).optional(),
});

/**
 * Dos atajos que se pisan: misma tecla y misma condición.
 *
 * Es la mitad de [RF-702](../../../../docs/03-requerimientos-funcionales.md)
 * que pide **reportar** los conflictos. Viaja por el IPC porque quien los
 * detecta es el main —es el que lee el archivo— y quien los muestra es el
 * renderer.
 */
export const KeybindingConflictSchema = z.strictObject({
  key: z.string().min(1),
  commands: z.array(z.string()),
});

/** Payload de `keybindings:get`. Sin parámetros: hay un solo archivo. */
export const GetKeybindingsRequestSchema = z.strictObject({});

/**
 * Respuesta de `keybindings:get`.
 *
 * Viajan **sólo los del usuario**, no los de fábrica. Los de fábrica son código
 * del renderer —`DEFAULT_KEYBINDINGS`— y mandarlos por IPC sería mover una
 * constante de un proceso a otro para que vuelva igual.
 *
 * Los conflictos, en cambio, sí se calculan en el main: se detectan sobre la
 * lista completa, y el main la arma para eso.
 */
export const GetKeybindingsResponseSchema = z.strictObject({
  bindings: z.array(KeybindingSchema),
  conflicts: z.array(KeybindingConflictSchema),
  /** El error del archivo, si no parseó. La app sigue con los de fábrica. */
  error: z.strictObject({ code: z.string(), userMessage: z.string() }).nullable(),
});
