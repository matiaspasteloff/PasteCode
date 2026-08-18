import { z } from 'zod';

/**
 * Payload de `backups:write`.
 *
 * Va un archivo por llamada y no un lote. Son pocos —sólo las pestañas sucias—
 * y de a uno cada backup se escribe y se confirma por separado: un lote que
 * falla a la mitad deja la mitad de los respaldos sin saber cuál.
 */
export const WriteBackupRequestSchema = z.strictObject({
  path: z.string().min(1),
  content: z.string(),
});

/** Respuesta de `backups:write`: cuándo quedó guardado. */
export const WriteBackupResponseSchema = z.strictObject({
  savedAt: z.number(),
});

/** Un backup que sobrevivió a un cierre y todavía sirve para algo. */
export const RecoverableBackupSchema = z.strictObject({
  path: z.string().min(1),
  content: z.string(),
  savedAt: z.number(),
});

/** Payload de `backups:pending`. Sin parámetros: se piden todos. */
export const PendingBackupsRequestSchema = z.strictObject({});

/**
 * Respuesta de `backups:pending`: lo que se puede ofrecer restaurar.
 *
 * El filtrado ocurre **en el main**, igual que en `session:load` y por la misma
 * razón: el renderer no puede saber qué archivos siguen existiendo ni cuándo se
 * tocaron por última vez sin preguntarlo, y ofrecer restaurar algo que ya no
 * existe —o que se guardó después del backup— es un diálogo que se aprende a
 * cerrar sin leer.
 */
export const PendingBackupsResponseSchema = z.strictObject({
  backups: z.array(RecoverableBackupSchema),
});

/**
 * Payload de `backups:discard`.
 *
 * Sin `path` se descartan todos. Es lo que hace "no, gracias" en el diálogo de
 * recuperación: si quedaran, se volverían a ofrecer en el próximo arranque y
 * para siempre.
 */
export const DiscardBackupsRequestSchema = z.strictObject({
  path: z.string().min(1).optional(),
});

/** Respuesta de `backups:discard`. */
export const DiscardBackupsResponseSchema = z.strictObject({});
