import type { UpdateState } from '@pastecode/core';
import { z } from 'zod';

/**
 * Los canales de actualización de la app ([ADR-0034](../../../../docs/adr/0034-distribucion-multiplataforma-y-auto-update.md)).
 *
 * **Nada acá descarga ni instala solo.** `update:check` pregunta; descargar e
 * instalar son dos canales aparte que la UI llama sólo cuando la persona lo
 * pide. Ningún payload lleva una URL: `update:openReleasePage` abre la del
 * estado del main, así que un renderer comprometido no puede usarlo para abrir
 * lo que quiera.
 */

const UpdateStateBaseFields = {
  currentVersion: z.string(),
  availableVersion: z.string().nullable(),
  releaseUrl: z.string(),
  canInstallInApp: z.boolean(),
};

/**
 * El estado de las actualizaciones. La unión, sus estados y sus transiciones
 * están en `@pastecode/core` (`update/state.ts`); esto es su validación.
 */
export const UpdateStateSchema: z.ZodType<UpdateState> = z.discriminatedUnion('status', [
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('idle') }),
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('checking') }),
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('up-to-date') }),
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('available') }),
  z.strictObject({
    ...UpdateStateBaseFields,
    status: z.literal('downloading'),
    percent: z.number().min(0).max(100),
  }),
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('downloaded') }),
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('error'), message: z.string() }),
  z.strictObject({ ...UpdateStateBaseFields, status: z.literal('unsupported') }),
]);

/** Payload de `update:getState`. */
export const GetUpdateStateRequestSchema = z.strictObject({});

/**
 * Payload de `update:check`: buscar ahora. Devuelve el estado al terminar; los
 * pasos intermedios viajan por `update:stateChanged`.
 */
export const CheckForUpdateRequestSchema = z.strictObject({});

/**
 * Payload de `update:download`: descargar la versión disponible. Sólo a
 * pedido, y sólo si `canInstallInApp`.
 */
export const DownloadUpdateRequestSchema = z.strictObject({});

/**
 * Payload de `update:install`: cerrar la app e instalar lo descargado. Antes
 * de cerrar se apagan los procesos hijo, igual que en una salida normal
 * (RNF-10).
 */
export const InstallUpdateRequestSchema = z.strictObject({});

/** Payload de `update:openReleasePage`: abrir la página del release en el navegador. */
export const OpenReleasePageRequestSchema = z.strictObject({});

/** Respuesta de los canales que no devuelven el estado. */
export const UpdateEmptyResponseSchema = z.strictObject({});
