import { z } from 'zod';

/**
 * Payload de `search:start`.
 *
 * Las exclusiones **no** viajan en el request: salen de `files.exclude` de las
 * settings, que ya vive en el main. RF-005 dice que ésa es la clave
 * configurable y el schema no tiene ninguna sección `search.*`; tener dos
 * fuentes para lo mismo sería tener dos formas de que el árbol y la búsqueda
 * muestren cosas distintas.
 */
export const StartSearchRequestSchema = z.strictObject({
  /**
   * Identifica la búsqueda. Lo elige el renderer y vuelve en cada evento.
   *
   * Sin esto, los resultados de una consulta que se está cancelando se pintan
   * sobre los de la siguiente: entre que se pide cancelar y que el proceso
   * muere, ripgrep sigue escribiendo.
   */
  searchId: z.string().min(1),
  query: z.string().min(1),
  isRegex: z.boolean(),
  isCaseSensitive: z.boolean(),
  matchWholeWord: z.boolean(),
  /** Globs de inclusión ([RF-203](../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)). */
  includeGlobs: z.array(z.string().min(1)),
});

/** Respuesta de `search:start`. Los resultados llegan por eventos. */
export const StartSearchResponseSchema = z.strictObject({});

/** Payload de `search:cancel`. */
export const CancelSearchRequestSchema = z.strictObject({});

/** Respuesta de `search:cancel`. */
export const CancelSearchResponseSchema = z.strictObject({});
