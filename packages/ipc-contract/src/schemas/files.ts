import { z } from 'zod';

/** Un archivo del índice de quick open. */
export const IndexedFileSchema = z.strictObject({
  path: z.string().min(1),
  relativePath: z.string().min(1),
});

/** Payload de `files:index`. La raíz la sabe el main. */
export const IndexFilesRequestSchema = z.strictObject({});

/**
 * Respuesta de `files:index`: el índice entero, de una vez.
 *
 * Viaja completo y no por página a propósito. El matching de
 * [RF-205](../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * corre en el renderer, sin cruzar el proceso por tecla, y ésa es la única
 * forma de cumplir su presupuesto de 50ms. El costo es un mensaje grande al
 * abrir el workspace; el beneficio es que después no hay ninguno.
 */
export const IndexFilesResponseSchema = z.strictObject({
  files: z.array(IndexedFileSchema),
  /** Si se cortó por el tope. La UI lo dice en vez de mentir por omisión. */
  truncated: z.boolean(),
});
