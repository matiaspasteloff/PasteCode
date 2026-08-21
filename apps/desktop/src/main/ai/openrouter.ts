import type { AiModel, CompletionState } from '@pastecode/core';
import {
  AiCancelledError,
  AiRequestError,
  AI_TOOLS,
  applyCompletionChunk,
  consumeSse,
  EMPTY_COMPLETION,
  freeModels,
  MissingApiKeyError,
} from '@pastecode/core';

import { loadApiKey } from './credentials.js';

/** La base de la API. Una sola constante: el resto son rutas. */
const API_BASE = 'https://openrouter.ai/api/v1';

/**
 * Headers que OpenRouter pide para atribuir el tráfico.
 *
 * No son opcionales para el plan gratuito: sin ellos, varias rutas responden
 * 403. `HTTP-Referer` no apunta a una URL nuestra que exista —no hay sitio—
 * sino al repositorio, que es lo que la documentación pide para una app de
 * escritorio.
 */
const ATTRIBUTION_HEADERS: Readonly<Record<string, string>> = {
  'HTTP-Referer': 'https://github.com/matiaspasteloff/PasteCode',
  'X-Title': 'PasteCode',
};

/**
 * El catálogo de gratuitos, recordado para toda la sesión.
 *
 * `null` es "todavía no se pidió". Es la misma respuesta durante toda la
 * sesión, y pedirla antes de cada mensaje sería un viaje de red por pregunta.
 */
let catalog: AiModel[] | null = null;

/**
 * Un mensaje tal como viaja en la request.
 *
 * **No es `AiMessage`.** El contrato lleva lo que el renderer conoce —rol y
 * texto—, y esto lleva además las llamadas a herramienta que el modelo pidió,
 * que sólo existen adentro del loop del agente. Mezclarlos obligaría al
 * renderer a modelar el protocolo de function calling para nada.
 */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
}

/** Lo que hace falta para pedir una respuesta. */
export interface CompletionRequest {
  model: string;
  messages: readonly WireMessage[];
  /** Se llama con cada trozo de texto, a medida que llega. */
  onDelta: (text: string) => void;
  /** Corta el `fetch`. Lo provee el agente, uno por `requestId`. */
  signal: AbortSignal;
}

/**
 * Pide el catálogo y devuelve **sólo los gratuitos**.
 *
 * El filtro lo hace `freeModels` en `packages/core`, que es puro y está
 * testeado; acá queda la parte que toca la red. La partición es la misma que
 * `buildRipgrepArgs` / `startSearch`.
 *
 * @returns Los modelos que no cuestan nada, ordenados por nombre.
 * @throws {MissingApiKeyError} Si no hay clave configurada.
 * @throws {AiRequestError} Si OpenRouter rechaza la consulta.
 * @example
 * const models = await listFreeModels();
 */
export async function listFreeModels(): Promise<AiModel[]> {
  const response = await fetch(`${API_BASE}/models`, {
    headers: { ...ATTRIBUTION_HEADERS, Authorization: `Bearer ${await requireApiKey()}` },
  });

  if (!response.ok) throw new AiRequestError(response.status, await safeText(response));

  catalog = freeModels(await response.json());

  return catalog;
}

/**
 * Verifica que el modelo pedido esté en la lista de gratuitos.
 *
 * **Es el filtro del lado del canal**, y existe además del de la UI a
 * propósito: el de la UI evita el error de elegir mal, éste evita que un
 * renderer comprometido —o una extensión— mande un id pago y le genere un
 * cargo a alguien que nunca lo pidió. Es
 * [RF-1002](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental),
 * que es un requisito de plata y no de comodidad.
 *
 * El catálogo se pide una vez y se recuerda: es la misma respuesta para toda
 * la sesión, y pedirla en cada mensaje sería un viaje de red antes de cada
 * pregunta.
 *
 * @param model El id que mandó el renderer.
 * @returns La ventana de contexto del modelo, para el recorte.
 * @throws {AiRequestError} Si el modelo no está entre los gratuitos.
 * @example
 * const contextLength = await assertFreeModel('x/y:free');
 */
export async function assertFreeModel(model: string): Promise<number> {
  catalog ??= await listFreeModels();

  const found = catalog.find((candidate) => candidate.id === model);

  if (found === undefined) {
    throw new AiRequestError(400, `el modelo "${model}" no está entre los gratuitos`);
  }

  return found.contextLength;
}

/** Olvida el catálogo. Lo llama `ai:clearApiKey`: otra clave, otro catálogo. */
export function forgetCatalog(): void {
  catalog = null;
}

/**
 * Pide una respuesta con streaming y devuelve lo que se acumuló.
 *
 * El texto se entrega por `onDelta` a medida que llega, no al final: es lo que
 * hace que quince segundos de escritura no sean quince segundos de pantalla
 * quieta. Lo que devuelve es el estado completo, que es lo que el agente
 * necesita para decidir si hay herramientas que ejecutar.
 *
 * **`fetch` nativo y ningún SDK.** Node 24 lo trae, el parseo de SSE son
 * cuarenta líneas puras en `core`, y un SDK ataría el IDE a un proveedor por
 * megabytes contra el techo de RNF-05. Ver
 * [ADR-0029](../../../../../docs/adr/0029-asistente-de-ia-en-el-main.md).
 *
 * @param request Modelo, conversación, callback de deltas y señal de aborto.
 * @returns El texto y las llamadas a herramienta que pidió el modelo.
 * @throws {MissingApiKeyError} Si no hay clave configurada.
 * @throws {AiRequestError} Si OpenRouter responde con un error.
 * @throws {AiCancelledError} Si se abortó desde la UI.
 * @example
 * const result = await streamCompletion({ model, messages, onDelta, signal });
 */
export async function streamCompletion(request: CompletionRequest): Promise<CompletionState> {
  const response = await post(request).catch((cause: unknown) => {
    // Un `fetch` abortado tira `AbortError`, que sin esto llegaría a la UI
    // como "algo salió mal" en vez de "se canceló".
    if (request.signal.aborted) throw new AiCancelledError();
    throw new AiRequestError(0, String(cause));
  });

  if (!response.ok) throw new AiRequestError(response.status, await safeText(response));
  if (response.body === null) throw new AiRequestError(response.status, 'respuesta sin cuerpo');

  return drain(response.body, request);
}

/** Manda la request de completion, con las herramientas declaradas. */
async function post(request: CompletionRequest): Promise<Response> {
  return fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    signal: request.signal,
    headers: {
      ...ATTRIBUTION_HEADERS,
      Authorization: `Bearer ${await requireApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
      tools: AI_TOOLS,
    }),
  });
}

/**
 * Lee el stream hasta el final, emitiendo los deltas de texto.
 *
 * El `rest` del parser se pasa de vuelta en cada vuelta: un chunk de red casi
 * nunca coincide con un evento SSE, y tratar cada uno como completo pierde
 * tokens al azar según cómo caiga el TCP.
 */
async function drain(
  body: ReadableStream<Uint8Array>,
  request: CompletionRequest
): Promise<CompletionState> {
  const decoder = new TextDecoder();
  const reader = body.getReader();

  let pending = '';
  let state = EMPTY_COMPLETION;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      const parsed = consumeSse(pending, decoder.decode(value, { stream: true }));
      pending = parsed.rest;

      for (const event of parsed.events) {
        const next = applyCompletionChunk(state, parseEvent(event));

        // Sólo lo nuevo: `onDelta` es un evento de IPC, y mandar el acumulado
        // en cada chunk sería mandar la respuesta entera N veces.
        if (next.content !== state.content)
          request.onDelta(next.content.slice(state.content.length));

        state = next;
      }

      if (parsed.isDone) break;
    }
  } catch (cause) {
    if (request.signal.aborted) throw new AiCancelledError();
    throw new AiRequestError(0, String(cause));
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return state;
}

/** Parsea el payload de un evento. Un JSON roto se ignora, no corta. */
function parseEvent(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    // Un evento suelto que no parsea no puede tirar la respuesta entera:
    // `applyCompletionChunk` ya ignora lo que no reconoce, y devolver `null`
    // lo hace caer por ese mismo camino.
    return null;
  }
}

/** La clave, o el error que la UI sabe explicar. */
async function requireApiKey(): Promise<string> {
  const key = await loadApiKey();

  if (key === null) throw new MissingApiKeyError();

  return key;
}

/**
 * El cuerpo de una respuesta de error, si se puede leer.
 *
 * Va al `message` técnico del error y nunca al `userMessage`: es lo que le
 * sirve a quien lee el log, y puede traer adentro cualquier cosa que el
 * servidor haya decidido contar (RNF-25).
 */
async function safeText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}
