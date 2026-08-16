import { COMPLETION_KINDS } from '@pastecode/core';
import { z } from 'zod';

/**
 * Una posición, **base 1**, igual que `SearchMatch` y `TabState`.
 *
 * La conversión a la base 0 del protocolo vive en `packages/core/src/lsp` y la
 * usa **sólo** `apps/desktop/src/main/lsp`. Un error de ±1 no rompe nada
 * visible: subraya la palabra de al lado. Por eso tiene un único lugar donde
 * estar.
 */
export const DocumentPositionSchema = z.strictObject({
  line: z.int().min(1),
  column: z.int().min(1),
});

export const DocumentRangeSchema = z.strictObject({
  start: DocumentPositionSchema,
  end: DocumentPositionSchema,
});

/**
 * Payload de `lsp:openDocument`.
 *
 * El `version` es el `getVersionId()` de Monaco, pasado sin tocar. El main
 * descarta cualquier cambio con versión menor o igual a la última registrada:
 * es una descarga vieja llegando después de un close/reopen, y aplicarla
 * desincroniza al servidor para siempre.
 */
export const OpenDocumentRequestSchema = z.strictObject({
  path: z.string().min(1),
  /** El `languageId` de Monaco. Es lo que elige el servidor. */
  languageId: z.string().min(1),
  version: z.int(),
  text: z.string(),
});

/**
 * Respuesta de `lsp:openDocument`.
 *
 * `serverId` en `null` significa "este lenguaje no tiene servidor, o el LSP
 * está apagado". El renderer lo usa para no registrar proveedores que nunca
 * van a responder.
 */
export const OpenDocumentResponseSchema = z.strictObject({
  serverId: z.string().nullable(),
});

/**
 * Un cambio incremental, tal como lo produce Monaco.
 *
 * `range` es el rango **anterior** al cambio y `text` lo que lo reemplaza, que
 * es exactamente la forma de `TextDocumentContentChangeEvent`. Nunca viaja el
 * documento entero: mandar el texto completo pondría un archivo de 10MB
 * (RNF-03) por el IPC en cada tecla.
 */
export const DocumentChangeSchema = z.strictObject({
  range: DocumentRangeSchema,
  text: z.string(),
});

/** Payload de `lsp:changeDocument`: un lote de cambios, en orden. */
export const ChangeDocumentRequestSchema = z.strictObject({
  path: z.string().min(1),
  version: z.int(),
  changes: z.array(DocumentChangeSchema).min(1),
});

export const ChangeDocumentResponseSchema = z.strictObject({});

export const CloseDocumentRequestSchema = z.strictObject({
  path: z.string().min(1),
});

export const CloseDocumentResponseSchema = z.strictObject({});

/** Payload de `lsp:completion`. */
export const CompletionRequestSchema = z.strictObject({
  path: z.string().min(1),
  position: DocumentPositionSchema,
  /** El carácter que la disparó, o `null` si fue explícita. */
  triggerCharacter: z.string().min(1).nullable(),
});

/** Un ítem de completado. `id` es su índice en esta misma respuesta. */
export const CompletionItemSchema = z.strictObject({
  id: z.int().min(0),
  label: z.string(),
  kind: z.enum(COMPLETION_KINDS),
  detail: z.string().nullable(),
  documentation: z.string().nullable(),
  insertText: z.string(),
  isSnippet: z.boolean(),
  sortText: z.string().nullable(),
  filterText: z.string().nullable(),
  range: DocumentRangeSchema.nullable(),
});

/**
 * Respuesta de `lsp:completion`.
 *
 * `isIncomplete` viaja porque es lo que le dice a Monaco que tiene que volver a
 * preguntar en vez de filtrar del lado del cliente. Perderlo hace que escribir
 * una letra más deje de traer sugerencias nuevas, que es el bug clásico de
 * cualquier integración de completado.
 */
export const CompletionResponseSchema = z.strictObject({
  isIncomplete: z.boolean(),
  items: z.array(CompletionItemSchema),
});

/**
 * Payload de `lsp:resolveCompletion`.
 *
 * Viaja el `id` y no el ítem: `completionItem/resolve` espera de vuelta el
 * objeto crudo del servidor, con su campo `data` opaco, y hacerlo pasar dos
 * veces por el IPC es exponer al renderer un dato de un binario de terceros
 * para nada. El main se quedó con la respuesta.
 */
export const ResolveCompletionRequestSchema = z.strictObject({
  serverId: z.string().min(1),
  id: z.int().min(0),
});

/** Respuesta de `lsp:resolveCompletion`: el ítem con la documentación llena. */
export const ResolveCompletionResponseSchema = z.strictObject({
  item: CompletionItemSchema.nullable(),
});

export const HoverRequestSchema = z.strictObject({
  path: z.string().min(1),
  position: DocumentPositionSchema,
});

/** Respuesta de `lsp:hover`: markdown ya aplanado, o `null` si no hay nada. */
export const HoverResponseSchema = z.strictObject({
  contents: z.string().nullable(),
  range: DocumentRangeSchema.nullable(),
});

export const DefinitionRequestSchema = z.strictObject({
  path: z.string().min(1),
  position: DocumentPositionSchema,
});

/** Una definición: un archivo y dónde adentro. */
export const DefinitionLocationSchema = z.strictObject({
  path: z.string().min(1),
  range: DocumentRangeSchema,
});

/**
 * Respuesta de `lsp:definition`.
 *
 * Es una lista y no una ubicación porque `textDocument/definition` puede
 * devolver varias —un símbolo declarado en un `.d.ts` y en su implementación—,
 * y elegir por el usuario es esconderle la mitad de la respuesta.
 */
export const DefinitionResponseSchema = z.strictObject({
  locations: z.array(DefinitionLocationSchema),
});

/**
 * En qué estado está un servidor.
 *
 * `failed` es terminal y visible: es lo que pasa cuando el ejecutable no está,
 * cuando falta el módulo del workspace o cuando el servidor negoció un
 * `positionEncoding` que no es UTF-16.
 */
export const LSP_SERVER_STATES = ['starting', 'running', 'failed', 'stopped'] as const;

export const LspServerStatusSchema = z.strictObject({
  serverId: z.string().min(1),
  state: z.enum(LSP_SERVER_STATES),
  /** Qué mostrarle a la persona si algo salió mal. `null` si no hay nada que decir. */
  userMessage: z.string().nullable(),
});

/** Payload de `lsp:status`. */
export const LspStatusRequestSchema = z.strictObject({});

/**
 * Respuesta de `lsp:status`: el snapshot de todos los servidores conocidos.
 *
 * Existe además del evento `lsp:serverChanged` porque los servidores pueden
 * estar corriendo cuando la ventana recarga: sin la pregunta, el renderer se
 * queda esperando un hecho que ya pasó. Es el mismo par que
 * `git:getStatus` / `git:changed`.
 */
export const LspStatusResponseSchema = z.strictObject({
  servers: z.array(LspServerStatusSchema),
});

export type CompletionItem = z.infer<typeof CompletionItemSchema>;
export type LspServerStatus = z.infer<typeof LspServerStatusSchema>;
export type DocumentChange = z.infer<typeof DocumentChangeSchema>;
export type DefinitionLocation = z.infer<typeof DefinitionLocationSchema>;
