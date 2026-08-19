import { ExtensionCallTimeoutError, ExtensionHostUnavailableError } from '@pastecode/core';

import type { RpcError, RpcMessage, RpcRequest, RpcResponse } from './protocol.js';
import { isRpcRequest, isRpcResponse, RPC_TIMEOUT_MS } from './protocol.js';

/** Lo que atiende un método. Puede ser async; lo que devuelva viaja serializado. */
export type RpcHandler = (params: unknown) => unknown;

/** Cómo se arma un endpoint. */
export interface RpcEndpointConfig {
  /** Pone un mensaje en el canal. Es lo único que el endpoint sabe del transporte. */
  readonly send: (message: RpcMessage) => void;
  /** Cuánto se espera cada respuesta. Por omisión, los 5 s del protocolo. */
  readonly timeoutMs?: number;
}

/**
 * Una punta del protocolo. Las dos —main y host— son iguales.
 *
 * Que sea simétrico no es elegancia: el host le pide cosas al main (registrar
 * un comando, leer el documento) tanto como el main le pide cosas al host
 * (activar una extensión, ejecutar un comando). Dos clases distintas serían la
 * misma correlación escrita dos veces.
 */
export interface RpcEndpoint {
  /**
   * Llama a un método del otro lado y espera la respuesta.
   *
   * @throws {ExtensionCallTimeoutError} Si no contesta antes del timeout.
   * @throws {ExtensionHostUnavailableError} Si el canal se cierra antes.
   */
  request(method: string, params?: unknown): Promise<unknown>;
  /** Registra quién atiende un método. Un método ya registrado se reemplaza. */
  handle(method: string, handler: RpcHandler): void;
  /** Le entrega al endpoint un mensaje del canal. Lo que no es del protocolo se ignora. */
  receive(message: unknown): void;
  /**
   * Cierra la punta y **rechaza todo lo pendiente**.
   *
   * Es lo que se llama cuando el proceso del otro lado murió. Sin esto, cada
   * crash del host dejaría una `Promise` por llamada en vuelo que no resuelve
   * ni rechaza nunca: el `await` de quien llamó se queda ahí para siempre y el
   * timeout llega recién cinco segundos tarde, con el host ya reiniciado.
   */
  dispose(reason: string): void;
  /** Cuántas llamadas están esperando respuesta. Para los tests y el log. */
  pendingCount(): number;
}

/** Una llamada en vuelo. */
interface Pending {
  readonly settle: (response: RpcResponse) => void;
  readonly fail: (cause: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Todo lo que cambia a lo largo de la vida de un endpoint.
 *
 * Es un objeto mutable pasado por parámetro y no un puñado de variables en el
 * closure de la fábrica por lo mismo que en
 * [`supervised-process`](../../../apps/desktop/src/main/supervisors/supervised-process.ts):
 * escrito adentro de la fábrica, el ciclo entero —pedir, correlacionar,
 * expirar, cerrar— no entra en las 50 líneas por función de RNF-20 ni se lee
 * de un vistazo.
 */
interface EndpointState {
  readonly send: (message: RpcMessage) => void;
  readonly timeoutMs: number;
  readonly handlers: Map<string, RpcHandler>;
  readonly pending: Map<number, Pending>;
  nextId: number;
  /** El motivo del cierre, o `null` si sigue abierto. */
  closed: string | null;
}

/**
 * Crea una punta del protocolo sobre un canal cualquiera.
 *
 * No sabe nada de `MessagePort`, de `utilityProcess` ni de Electron: recibe un
 * `send` y le entregan los mensajes con `receive`. Es lo que lo hace testeable
 * sin lanzar un proceso, y lo que permite que el main y el host usen el mismo
 * código sobre transportes que no son el mismo objeto.
 *
 * @param config El transporte y, opcionalmente, el timeout.
 * @returns La punta, lista para pedir y para atender.
 * @example
 * const rpc = createRpcEndpoint({ send: (m) => child.postMessage(m) });
 * const version = await rpc.request('host/ready');
 */
export function createRpcEndpoint(config: RpcEndpointConfig): RpcEndpoint {
  const state: EndpointState = {
    send: config.send,
    timeoutMs: config.timeoutMs ?? RPC_TIMEOUT_MS,
    handlers: new Map(),
    pending: new Map(),
    nextId: 1,
    closed: null,
  };

  return {
    request: (method, params) => call(state, method, params),

    handle(method, handler) {
      state.handlers.set(method, handler);
    },

    receive: (message) => {
      receive(state, message);
    },

    dispose: (reason) => {
      dispose(state, reason);
    },

    pendingCount: () => state.pending.size,
  };
}

/** Manda una request y se queda esperando su respuesta, con su timeout. */
function call(state: EndpointState, method: string, params: unknown): Promise<unknown> {
  if (state.closed !== null) {
    return Promise.reject(new ExtensionHostUnavailableError(state.closed));
  }

  const id = state.nextId++;

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new ExtensionCallTimeoutError(method, state.timeoutMs));
    }, state.timeoutMs);

    state.pending.set(id, {
      fail: reject,
      settle: (response) => {
        if (response.error === undefined) resolve(response.result);
        else reject(toError(response.error));
      },
      timer,
    });

    state.send({ kind: 'request', id, method, params });
  });
}

/** Rutea lo que llegó del canal. Lo que no es del protocolo se descarta. */
function receive(state: EndpointState, message: unknown): void {
  if (isRpcResponse(message)) {
    settlePending(state.pending, message);
    return;
  }

  if (isRpcRequest(message)) {
    void dispatch(state, message);
  }

  // Cualquier otra cosa se descarta en silencio. Del otro lado del canal hay
  // código de terceros: un mensaje que no es del protocolo es lo esperable, no
  // una excepción que valga la pena propagar.
}

/** Cierra la punta y rechaza todo lo que estaba esperando. */
function dispose(state: EndpointState, reason: string): void {
  state.closed = reason;

  for (const [, pending] of state.pending) {
    clearTimeout(pending.timer);
    pending.fail(new ExtensionHostUnavailableError(reason));
  }

  state.pending.clear();
}

/** Entrega una respuesta a su llamada, si todavía está esperando. */
function settlePending(pending: Map<number, Pending>, response: RpcResponse): void {
  const call = pending.get(response.id);

  // Una respuesta sin llamada es lo normal después de un timeout: la request
  // ya se rechazó y la respuesta llegó tarde. Descartarla es lo correcto;
  // tratarla como error haría ruido en el log cada vez que algo tarda de más.
  if (call === undefined) return;

  clearTimeout(call.timer);
  pending.delete(response.id);
  call.settle(response);
}

/** Corre el handler de una request y contesta, salga bien o mal. */
async function dispatch(state: EndpointState, request: RpcRequest): Promise<void> {
  const handler = state.handlers.get(request.method);

  if (handler === undefined) {
    state.send({
      kind: 'response',
      id: request.id,
      error: { code: 'UNKNOWN_METHOD', message: `Unknown method: ${request.method}` },
    });
    return;
  }

  try {
    state.send({ kind: 'response', id: request.id, result: await handler(request.params) });
  } catch (cause) {
    // Todo lo que lance un handler se contesta como error y no se propaga: del
    // otro lado hay alguien esperando, y dejar escapar la excepción lo dejaría
    // colgado hasta el timeout por un error que ya conocemos.
    state.send({ kind: 'response', id: request.id, error: fromCause(cause) });
  }
}

/** Aplana cualquier cosa lanzada a la forma que cruza el canal. */
function fromCause(cause: unknown): RpcError {
  if (cause instanceof Error) {
    const code =
      'code' in cause && typeof cause.code === 'string' ? cause.code : 'HANDLER_FAILED';

    return { code, message: cause.message };
  }

  return { code: 'HANDLER_FAILED', message: String(cause) };
}

/** Reconstruye un error del otro lado como algo que se puede lanzar. */
function toError(error: RpcError): Error {
  const rebuilt = new Error(error.message);

  rebuilt.name = error.code;

  return rebuilt;
}
