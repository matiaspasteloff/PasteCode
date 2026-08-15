import { z } from 'zod';

/**
 * Payload de `fs:readFile`.
 *
 * **La ruta es absoluta.** Coincide con el ejemplo de
 * [02-arquitectura](../../../../docs/02-arquitectura.md#patrón-de-ipc) y con el
 * `uri` absoluto de `TabState` en el
 * [modelo de datos](../../../../docs/05-modelo-de-datos.md#estado-del-workspace).
 * La contención se valida en el main contra el workspace abierto; el renderer
 * no gana nada mandando rutas relativas y sí perdería la capacidad de nombrar
 * un archivo sin ambigüedad.
 *
 * No hay `encoding: 'binary'`: la Etapa 2 lee UTF-8 y nada más. Un archivo con
 * bytes nulos se rechaza con `BINARY_FILE_UNSUPPORTED`.
 */
export const ReadFileRequestSchema = z.strictObject({
  path: z.string().min(1),
});

/**
 * Respuesta de `fs:readFile`.
 *
 * El `mtimeMs` no es informativo: es lo que el renderer guarda para mandarlo
 * de vuelta como `expectedMtimeMs` al guardar, y así detectar que el archivo
 * cambió en disco mientras tanto.
 */
export const ReadFileResponseSchema = z.strictObject({
  content: z.string(),
  mtimeMs: z.number(),
});

/**
 * Payload de `fs:writeFile`.
 *
 * `expectedMtimeMs` está desde el primer día a propósito. Es el gancho de la
 * detección de conflictos de [RF-004](../../../../docs/03-requerimientos-funcionales.md);
 * agregarlo ahora son tres líneas y agregarlo después es un cambio de contrato
 * que toca a todos los que ya lo consumen. Omitirlo significa "escribí igual",
 * que es lo que hace un "guardar de todas formas".
 */
export const WriteFileRequestSchema = z.strictObject({
  path: z.string().min(1),
  content: z.string(),
  expectedMtimeMs: z.number().optional(),
});

/** Respuesta de `fs:writeFile`: el `mtimeMs` nuevo, para la próxima escritura. */
export const WriteFileResponseSchema = z.strictObject({
  mtimeMs: z.number(),
});

/** Una entrada de directorio. La `path` absoluta es la clave de todo el árbol. */
export const DirectoryEntrySchema = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
  isDirectory: z.boolean(),
});

/**
 * Payload de `fs:readDirectory`.
 *
 * Lista **un solo nivel**, no recursivo. El árbol pide los hijos al expandir.
 * Es lo que hace que el criterio de
 * [RF-001](../../../../docs/03-requerimientos-funcionales.md) —el árbol visible
 * en menos de 500ms con 5.000 archivos— sea trivial de cumplir en vez de una
 * pelea: nunca se recorre más de una carpeta por vez.
 */
export const ReadDirectoryRequestSchema = z.strictObject({
  path: z.string().min(1),
});

/**
 * Respuesta de `fs:readDirectory`: las entradas ya ordenadas y ya filtradas
 * por las exclusiones.
 *
 * El filtrado ocurre en el main y no en el renderer para que `node_modules` ni
 * siquiera cruce el IPC. Serializar 40.000 entradas para que la UI las tire es
 * pagar el costo dos veces.
 */
export const ReadDirectoryResponseSchema = z.strictObject({
  entries: z.array(DirectoryEntrySchema),
});
