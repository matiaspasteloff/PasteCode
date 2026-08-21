import { AiMessageSchema, AiModelSchema, AI_TOOL_NAMES } from '@pastecode/core';
import { z } from 'zod';

/**
 * Los schemas de la conversación y de los modelos se importan de
 * `@pastecode/core` en vez de redefinirse acá.
 *
 * Es la misma dirección y la misma razón que el schema de settings: el recorte
 * por presupuesto de contexto y el filtro de modelos gratuitos **son lógica
 * del dominio**, viven donde se testean sin I/O, y el schema es parte de esa
 * lógica. Duplicar la forma acá sería tener dos definiciones que se
 * desincronizan sin que nadie lo note hasta que un mensaje válido de un lado
 * se rechaza del otro.
 */

/** Payload de `ai:listModels`. Sin parámetros: el catálogo es uno solo. */
export const ListAiModelsRequestSchema = z.strictObject({});

/**
 * Respuesta de `ai:listModels`: los modelos **ya filtrados** a los gratuitos.
 *
 * El filtro corre en el main y no acá por lo mismo que las exclusiones de la
 * búsqueda: quien tiene la respuesta cruda de OpenRouter es el main, y
 * mandarla entera para que el renderer la filtre sería serializar un catálogo
 * de trescientos modelos para pintar treinta.
 */
export const ListAiModelsResponseSchema = z.strictObject({
  models: z.array(AiModelSchema),
});

/**
 * Payload de `ai:chat`: arrancar una respuesta.
 *
 * El `requestId` lo elige el renderer y vuelve en cada evento, exactamente
 * como el `searchId` de `search:start`. Sin él, los deltas de una respuesta
 * que se está cancelando se pintan sobre la siguiente: entre que se pide
 * cancelar y que el `fetch` se aborta, el servidor sigue escribiendo.
 *
 * La conversación viaja **entera** en cada llamada y el main no guarda
 * historial. Es lo que hace que el asistente no tenga estado que se pueda
 * desincronizar entre procesos: el renderer es dueño de la conversación, el
 * main es dueño de la conexión.
 */
export const AiChatRequestSchema = z.strictObject({
  requestId: z.string().min(1),
  /** El id del modelo. Se verifica contra la lista de gratuitos en el main. */
  model: z.string().min(1),
  messages: z.array(AiMessageSchema).min(1),
});

/**
 * Respuesta de `ai:chat`. Vacía a propósito: lo que importa va por evento.
 *
 * Es la misma forma que `search:start`, y por la misma razón que documenta
 * [ADR-0013](../../../../docs/adr/0013-eventos-tipados-en-el-ipc.md): una
 * respuesta son cientos de chunks y `invoke` sólo sabe responder preguntas.
 */
export const AiChatResponseSchema = z.strictObject({});

/** Payload de `ai:cancel`: abortar una respuesta en curso. */
export const CancelAiRequestSchema = z.strictObject({
  requestId: z.string().min(1),
});

/** Respuesta de `ai:cancel`. */
export const CancelAiResponseSchema = z.strictObject({});

/**
 * Payload de `ai:setApiKey`.
 *
 * Es el **único** canal por el que la clave cruza, y cruza en una sola
 * dirección. No hay ninguno que la devuelva: ver `AiKeyStatusResponseSchema`.
 */
export const SetAiApiKeyRequestSchema = z.strictObject({
  apiKey: z.string().min(1),
});

/** Respuesta de `ai:setApiKey`. */
export const SetAiApiKeyResponseSchema = z.strictObject({});

/** Payload de `ai:getKeyStatus`. */
export const AiKeyStatusRequestSchema = z.strictObject({});

/**
 * Respuesta de `ai:getKeyStatus`. **Nunca devuelve la clave.**
 *
 * Un booleano y nada más, ni siquiera enmascarada: una clave que llega al
 * renderer es una clave que puede leer cualquier XSS o cualquier extensión.
 * Lo único que la UI necesita saber es si hay que pedirla ([RF-1003](../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)).
 *
 * `canPersist` es distinto de `hasKey`: dice si `safeStorage` está
 * disponible en este sistema. Sin él, la UI no puede explicar por qué la clave
 * que acaba de escribir no se va a recordar.
 */
export const AiKeyStatusResponseSchema = z.strictObject({
  hasKey: z.boolean(),
  canPersist: z.boolean(),
});

/** Payload de `ai:clearApiKey`. */
export const ClearAiApiKeyRequestSchema = z.strictObject({});

/** Respuesta de `ai:clearApiKey`. */
export const ClearAiApiKeyResponseSchema = z.strictObject({});

/** Qué pasó con una herramienta de escritura que el modelo propuso. */
export const AI_TOOL_OUTCOMES = ['applied', 'discarded', 'failed'] as const;

/**
 * Payload de `ai:toolResult`: la mitad renderer → main del pull.
 *
 * Es el espejo exacto de `extensions:documentResponse`
 * ([ADR-0026](../../../../docs/adr/0026-broker-unico-y-pull-del-documento-activo.md)):
 * el main no le puede *preguntar* nada al renderer, así que la pregunta viaja
 * como el evento `ai:toolCall` con un `toolCallId`, y la respuesta vuelve por
 * este canal, que es un `invoke` con su schema como cualquier otro.
 *
 * `discarded` **no es un error**: es la respuesta de alguien que miró el diff
 * y dijo que no. Se le informa al modelo como resultado de la herramienta para
 * que sepa que el archivo no cambió, en vez de seguir asumiendo que sí.
 */
export const AiToolResultRequestSchema = z.strictObject({
  requestId: z.string().min(1),
  toolCallId: z.string().min(1),
  outcome: z.enum(AI_TOOL_OUTCOMES),
  /** Qué contarle al modelo. Vacío es "no hay nada más que decir". */
  detail: z.string(),
});

/** Respuesta de `ai:toolResult`. */
export const AiToolResultResponseSchema = z.strictObject({});

/**
 * Los nombres de herramienta, como schema.
 *
 * Se reexporta la lista de `core` en vez de escribirla otra vez: el evento
 * `ai:toolCall` la nombra y el agente la valida, y son la misma lista.
 */
export const AiToolNameSchema = z.enum(AI_TOOL_NAMES);
