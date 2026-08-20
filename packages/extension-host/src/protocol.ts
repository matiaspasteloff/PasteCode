/**
 * El protocolo entre el main y el extension host.
 *
 * **No vive en `@pastecode/ipc-contract` a propósito.** Ese paquete está
 * documentado como el contrato main ↔ renderer, y éste es otro límite: otro
 * transporte —un `MessagePort` de `utilityProcess`, no `ipcRenderer.invoke`—,
 * otro modelo de confianza y otro ciclo de vida. Meter los dos en el mismo
 * paquete haría que agregar un método del host pareciera agregar un canal de
 * IPC, que es exactamente la confusión que separarlos evita.
 *
 * El main importa estos tipos; el host los define.
 */

/**
 * Cuánto se espera una respuesta antes de dar la llamada por perdida.
 *
 * Son los 5 s del [modelo de amenazas](../../../docs/convenciones/seguridad.md#modelo-de-amenazas--extensiones):
 * *"extensión que congela el IDE → proceso separado + timeout de 5 s en toda
 * llamada de API"*. El timeout es lo que convierte esa frase en código: sin él,
 * un `await` contra una extensión colgada es un `await` para siempre.
 */
export const RPC_TIMEOUT_MS = 5000;

/** Una llamada que espera respuesta. */
export interface RpcRequest {
  kind: 'request';
  /** Correlaciona la respuesta con esta llamada. Único por endpoint. */
  id: number;
  method: string;
  params: unknown;
}

/** La respuesta a una llamada, exitosa o fallida. */
export interface RpcResponse {
  kind: 'response';
  /** El `id` de la request que contesta. */
  id: number;
  /** Presente si salió bien. */
  result?: unknown;
  /** Presente si salió mal. Excluyente con `result`. */
  error?: RpcError;
}

/**
 * Un error que cruzó el límite de proceso.
 *
 * Es una forma plana y no un `Error`: lo que viaja por un `MessagePort` es lo
 * que sobrevive al structured clone, y un `Error` pierde su prototipo y su
 * stack en el camino. Mismo criterio que `SerializedError` del ipc-contract.
 */
export interface RpcError {
  /** Código estable, para poder ramificar sin comparar mensajes. */
  code: string;
  /** Qué pasó, para el log. No es texto de UI. */
  message: string;
}

/** Cualquier mensaje del protocolo. */
export type RpcMessage = RpcRequest | RpcResponse;

/** Si un mensaje cualquiera es una request del protocolo. */
export function isRpcRequest(message: unknown): message is RpcRequest {
  if (typeof message !== 'object' || message === null) return false;
  if (!('kind' in message) || message.kind !== 'request') return false;
  if (!('id' in message) || typeof message.id !== 'number') return false;

  return 'method' in message && typeof message.method === 'string';
}

/** Si un mensaje cualquiera es una respuesta del protocolo. */
export function isRpcResponse(message: unknown): message is RpcResponse {
  if (typeof message !== 'object' || message === null) return false;
  if (!('kind' in message) || message.kind !== 'response') return false;

  return 'id' in message && typeof message.id === 'number';
}
