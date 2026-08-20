import { z } from 'zod';

/**
 * Los roles de un mensaje de la conversación.
 *
 * Array `as const` y no un enum ([regla 5 de codigo.md](../../../../docs/convenciones/codigo.md#5-nada-de-enums-de-typescript)):
 * la unión sale del array, así que la lista es un dato que se puede recorrer.
 */
export const AI_MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;

export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/**
 * Un mensaje de la conversación.
 *
 * El schema vive en `core` y no en el contrato por lo mismo que el de
 * settings: **es lógica del dominio** —el recorte por presupuesto opera sobre
 * esta forma— y el contrato lo importa. Ver el comentario de
 * `packages/ipc-contract/src/schemas/settings.ts`.
 */
export const AiMessageSchema = z.strictObject({
  role: z.enum(AI_MESSAGE_ROLES),
  content: z.string(),
  /**
   * Correlaciona un mensaje de rol `tool` con la llamada que lo pidió.
   *
   * Sólo lo llevan los de ese rol. La API lo exige para poder emparejar el
   * resultado con la herramienta, y sin él la respuesta se rechaza entera.
   */
  toolCallId: z.string().min(1).optional(),
});

export type AiMessage = z.infer<typeof AiMessageSchema>;

/**
 * Cuántos caracteres se cuentan por token al estimar.
 *
 * Es una regla de dedo, no una tokenización: tokenizar de verdad significa
 * empaquetar el vocabulario del modelo, que son megabytes contra el techo de
 * RNF-05, y cada modelo de OpenRouter tiene el suyo. Cuatro caracteres por
 * token sobreestima en código y subestima en prosa muy repetitiva; el margen
 * de seguridad de abajo cubre el error en la dirección que importa.
 */
const CHARACTERS_PER_TOKEN = 4;

/**
 * Qué fracción de la ventana se reserva para la respuesta.
 *
 * Sin esto, una conversación que entra justo deja al modelo sin lugar para
 * contestar y la API devuelve un error que parece de otra cosa.
 */
const RESPONSE_RESERVE = 0.25;

/**
 * Estima cuántos tokens ocupa un texto.
 *
 * @param text El texto a medir.
 * @returns La estimación, siempre al alza.
 * @example
 * estimateTokens('hola mundo'); // 3
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}

/**
 * Recorta la conversación para que entre en la ventana del modelo.
 *
 * **Se tira desde el principio y nunca el `system`.** El mensaje de sistema es
 * el que dice qué herramientas hay y cómo usarlas; tirarlo deja al modelo
 * inventando llamadas que no existen, que es peor que no responder. Y se tira
 * desde el principio porque lo último que se dijo es lo que más importa —es la
 * pregunta que se está contestando—.
 *
 * **El último mensaje del usuario sobrevive siempre**, aunque solo no entre en
 * el presupuesto: mandar una conversación sin la pregunta es mandar cualquier
 * cosa. Si no entra, entra igual y que la rechace el servidor, que al menos
 * dice por qué.
 *
 * Un mensaje de rol `tool` que se queda sin su `assistant` correspondiente
 * también se descarta: la API rechaza un resultado de herramienta que no
 * sigue a la llamada que lo pidió.
 *
 * @param messages La conversación entera, en orden.
 * @param contextLength La ventana del modelo, en tokens.
 * @returns La conversación recortada, en orden.
 * @example
 * trimToBudget(messages, 8192);
 */
export function trimToBudget(
  messages: readonly AiMessage[],
  contextLength: number
): AiMessage[] {
  const budget = Math.floor(contextLength * (1 - RESPONSE_RESERVE));
  const system = messages.filter((message) => message.role === 'system');
  const rest = messages.filter((message) => message.role !== 'system');

  let remaining = budget - totalTokens(system);
  const kept: AiMessage[] = [];

  // De atrás para adelante: lo último dicho es lo que más importa.
  for (const message of [...rest].reverse()) {
    const cost = estimateTokens(message.content);

    // El primero que se mira es el último de la conversación, y ése entra sí o
    // sí: una conversación sin la pregunta no es una conversación recortada.
    if (kept.length > 0 && cost > remaining) break;

    remaining -= cost;
    kept.unshift(message);
  }

  return [...system, ...dropOrphanToolResults(kept)];
}

/** Lo que cuesta un conjunto de mensajes, en tokens estimados. */
function totalTokens(messages: readonly AiMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

/**
 * Saca los resultados de herramienta que quedaron sin su llamada.
 *
 * Pasa siempre que el recorte corta justo entre el `assistant` que pidió la
 * herramienta y el `tool` que trae el resultado. La API rechaza la
 * conversación entera en ese caso, así que es un recorte que no se puede
 * dejar para después.
 */
function dropOrphanToolResults(messages: readonly AiMessage[]): AiMessage[] {
  const firstNonTool = messages.findIndex((message) => message.role !== 'tool');

  return firstNonTool === -1 ? [] : messages.slice(firstNonTool);
}
