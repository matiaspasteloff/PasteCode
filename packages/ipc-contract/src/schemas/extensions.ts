import { z } from 'zod';

/**
 * En qué estado está el extension host.
 *
 * Es el estado **resuelto** y no el crudo del supervisor: quien lo consume no
 * tiene por qué distinguir "murió y todavía no arranqué el reintento" de
 * "arrancando el reintento". Las dos cosas se ven igual desde afuera —las
 * extensiones no andan y en un rato sí— y darles dos nombres sería obligar a
 * cada consumidor a saber de backoff.
 *
 * `gaveUp` es el único que no se arregla solo: son los tres intentos de
 * [RNF-09](../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)
 * agotados, y a partir de ahí el IDE sigue andando **sin** extensiones, que es
 * lo que [RF-907](../../../../docs/03-requerimientos-funcionales.md) pide.
 */
export const HostStateSchema = z.enum(['starting', 'ready', 'restarting', 'gaveUp']);

/** El estado del host, tal como lo ve el renderer. */
export const ExtensionHostStatusSchema = z.strictObject({
  state: HostStateSchema,
  /**
   * El pid del host vivo, o `null` si no hay ninguno.
   *
   * Viaja porque es lo que hace verificable el reinicio: un pid distinto es la
   * única prueba de que el proceso se relanzó y no de que nunca se cayó.
   */
  pid: z.number().nullable(),
  /** Cuántas veces se reinició desde que arrancó la app. */
  restarts: z.number(),
});

/** Payload de `extensions:getStatus`. Sin parámetros: el host es uno solo. */
export const GetExtensionHostStatusRequestSchema = z.strictObject({});

/** En qué estado quedó una extensión. */
export const ExtensionStateSchema = z.enum(['inactive', 'active', 'failed']);

/**
 * Una extensión, tal como la ve el renderer.
 *
 * Las que fallaron viajan igual, con su `reason`: [RF-902](../../../../docs/03-requerimientos-funcionales.md)
 * pide error **visible**, y una extensión que desaparece de la lista sin decir
 * nada no es visible.
 */
export const ExtensionInfoSchema = z.strictObject({
  name: z.string(),
  displayName: z.string(),
  version: z.string(),
  state: ExtensionStateSchema,
  reason: z.string().optional(),
});

/** Payload de `extensions:list`. Sin parámetros: se piden todas. */
export const ListExtensionsRequestSchema = z.strictObject({});

/** Respuesta de `extensions:list`. */
export const ListExtensionsResponseSchema = z.strictObject({
  extensions: z.array(ExtensionInfoSchema),
});
