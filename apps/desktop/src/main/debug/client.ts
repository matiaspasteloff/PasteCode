import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';

import type { DebugProtocol } from '@vscode/debugprotocol';

import type { ChildProcessHandle } from '../supervisors/adapters/child-handle.js';
import { adaptChildProcess } from '../supervisors/adapters/child-handle.js';
import type { SupervisedProcess } from '../supervisors/supervised-process.js';
import { createSupervisedProcess } from '../supervisors/supervised-process.js';

import { createMessageDecoder, encodeMessage } from './framing.js';
import type { AdapterLaunch } from './resolve-adapter.js';

/** Cuánto se le da al adaptador para irse por las buenas antes de matarlo. */
const GRACEFUL_EXIT_TIMEOUT_MS = 1000;

/** Cómo se levanta el adaptador y a quién le habla. */
export interface DebugClientOptions {
  readonly launch: AdapterLaunch;
  /** Raíz del workspace. Es el `cwd` del adaptador. */
  readonly cwd: string;
  /** Cuánto se espera cada respuesta. Sale de `debug.requestTimeoutMs`. */
  readonly requestTimeoutMs: number;
  /** Se llama con cada evento del adaptador: `stopped`, `output`, `terminated`. */
  readonly onEvent: (event: DebugProtocol.Event) => void;
  /** Se llama cuando el adaptador muere y no vuelve. */
  readonly onExit: () => void;
}

/** Un adaptador vivo, visto por el resto del main. */
export interface DebugClient {
  /** Lo lanza y engancha su stream. No hace el `initialize`: eso es de la sesión. */
  start(): void;
  /**
   * Manda un request y espera su respuesta.
   *
   * @throws {Error} Si el adaptador no está, contesta con error, o no contesta.
   */
  send<TBody>(command: string, args?: unknown): Promise<TBody>;
  /** Si hay un adaptador corriendo ahora mismo. */
  isRunning(): boolean;
  /** Lo apaga a propósito. Un apagado deliberado no reinicia nada. */
  stop(): Promise<void>;
}

/** Un request en vuelo. */
interface Pending {
  readonly resolve: (body: unknown) => void;
  readonly reject: (cause: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Todo lo que cambia a lo largo de la vida del cliente. */
interface ClientState {
  readonly options: DebugClientOptions;
  supervised: SupervisedProcess<ChildProcessHandle> | null;
  handle: ChildProcessHandle | null;
  readonly pending: Map<number, Pending>;
  /** El `seq` del próximo mensaje. DAP los quiere empezando en 1. */
  nextSeq: number;
  stopping: boolean;
}

/**
 * Crea el cliente del adaptador de debug.
 *
 * **No usa `vscode-jsonrpc` aunque el encuadre sea el mismo.** Esa librería
 * habla JSON-RPC 2.0 —`jsonrpc: "2.0"`, `id`, `method`, `params`— y DAP no es
 * JSON-RPC: tiene `seq`, `type`, `command` y `request_seq`, y sus eventos no
 * son notificaciones. Sólo comparten el `Content-Length`. Usarla obligaría a
 * traducir cada mensaje en los dos sentidos, que es más código y más frágil que
 * las ochenta líneas de `framing.ts`. Ver
 * [ADR-0028](../../../../../docs/adr/0028-adaptador-dap-externo-y-cliente-propio.md).
 *
 * El ciclo de vida del proceso no está acá: lo pone `createSupervisedProcess`,
 * el mismo que ya usan el PTY, el LSP y el extension host.
 *
 * **El adaptador habla por stdio.** Los que hablan por socket se envuelven
 * afuera: un `net.Socket` es un dúplex igual que un par de pipes, así que lo
 * que cambiaría es de dónde salen los streams y no una línea de este archivo.
 *
 * @param options Cómo lanzarlo y a quién avisarle.
 * @returns El cliente. Todavía sin lanzar.
 * @example
 * const client = createDebugClient({ launch, cwd, requestTimeoutMs, onEvent, onExit });
 * client.start();
 */
export function createDebugClient(options: DebugClientOptions): DebugClient {
  const state: ClientState = {
    options,
    supervised: null,
    handle: null,
    pending: new Map(),
    nextSeq: 1,
    stopping: false,
  };

  return {
    start() {
      state.stopping = false;
      state.supervised ??= createSupervisedProcess<ChildProcessHandle>({
        name: 'debug-adapter',
        spawn: () => spawnAdapter(options),
        // **Un adaptador no se reinicia solo.** Un servidor de lenguaje
        // relanzado vuelve a servir; una sesión de debug relanzada perdió el
        // proceso que estaba depurando, sus breakpoints y su stack. Reintentar
        // sería fingir que la sesión sigue viva. Se avisa y se apaga.
        policy: { maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0, healthyAfterMs: 0 },
        onExit: () => {
          rejectAll(state, new Error('El adaptador de debug terminó'));
          state.handle = null;

          if (!state.stopping) options.onExit();
        },
      });

      const handle = state.supervised.start();

      if (handle === null) return;

      state.handle = handle;
      listen(state, handle);
    },

    send: (command, args) => send(state, command, args),
    isRunning: () => state.handle !== null,

    async stop() {
      state.stopping = true;
      rejectAll(state, new Error('La sesión de debug se cerró'));
      await state.supervised?.stop(GRACEFUL_EXIT_TIMEOUT_MS);
      state.supervised = null;
      state.handle = null;
    },
  };
}

/** Lanza el adaptador con su entorno saneado. */
function spawnAdapter(options: DebugClientOptions): ChildProcessHandle {
  // `shell: false` y argumentos por array, como todo proceso hijo del proyecto:
  // una línea de comando armada a mano es una inyección esperando una ruta con
  // espacios. Ver convenciones/seguridad.md.
  const child: ChildProcessWithoutNullStreams = spawn(
    options.launch.file,
    options.launch.args,
    {
      cwd: options.cwd,
      env: options.launch.env,
      shell: false,
    }
  );

  return adaptChildProcess(child);
}

/** Engancha el stream del adaptador al decodificador. */
function listen(state: ClientState, handle: ChildProcessHandle): void {
  const decoder = createMessageDecoder();

  handle.stdout.on('data', (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) dispatch(state, message);
  });
}

/** Rutea un mensaje del adaptador a su request, o al listener de eventos. */
function dispatch(state: ClientState, message: DebugProtocol.ProtocolMessage): void {
  if (message.type === 'event') {
    state.options.onEvent(asEvent(message));
    return;
  }

  if (message.type !== 'response') return;

  const response = asResponse(message);
  const pending = state.pending.get(response.request_seq);

  // Una respuesta sin request es lo normal después de un timeout: ya se
  // rechazó y la respuesta llegó tarde. Descartarla es lo correcto.
  if (pending === undefined) return;

  clearTimeout(pending.timer);
  state.pending.delete(response.request_seq);

  if (response.success) pending.resolve(response.body);
  else
    pending.reject(new Error(response.message ?? `El adaptador rechazó "${response.command}"`));
}

/** Manda un request y se queda esperando su respuesta. */
function send<TBody>(state: ClientState, command: string, args: unknown): Promise<TBody> {
  const { handle } = state;

  if (handle === null)
    return Promise.reject(new Error('El adaptador de debug no está corriendo'));

  const seq = state.nextSeq++;

  return new Promise<TBody>((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(seq);
      reject(new Error(`El adaptador no contestó "${command}" a tiempo`));
    }, state.options.requestTimeoutMs);

    state.pending.set(seq, {
      resolve: (body) => {
        // Límite del sistema: del otro lado hay un ejecutable de terceros y lo
        // que llega es `unknown`. Los tipos de `@vscode/debugprotocol` describen
        // lo que el protocolo *promete* por comando, y quien llama sabe cuál
        // mandó. Verificar cada `body` acá sería transcribir a mano el schema
        // entero de DAP —cientos de interfaces— para volver a afirmar lo mismo.
        // Quien consume esto lo estrecha antes de mostrarlo.
        // eslint-disable-next-line no-restricted-syntax
        resolve(body as TBody);
      },
      reject,
      timer,
    });

    const request: DebugProtocol.Request = { seq, type: 'request', command };

    handle.stdin.write(
      encodeMessage(args === undefined ? request : { ...request, arguments: args })
    );
  });
}

/** Rechaza todo lo pendiente. Se llama cuando el adaptador se fue. */
function rejectAll(state: ClientState, cause: Error): void {
  for (const [, pending] of state.pending) {
    clearTimeout(pending.timer);
    pending.reject(cause);
  }

  state.pending.clear();
}

/** El mensaje visto como evento. Su `type` ya se verificó al decodificar. */
function asEvent(message: DebugProtocol.ProtocolMessage): DebugProtocol.Event {
  const name: unknown = Reflect.get(message, 'event');

  return { ...message, type: 'event', event: typeof name === 'string' ? name : '' };
}

/** El mensaje visto como respuesta, con lo que falte en su valor neutro. */
function asResponse(message: DebugProtocol.ProtocolMessage): DebugProtocol.Response {
  const requestSeq: unknown = Reflect.get(message, 'request_seq');
  const success: unknown = Reflect.get(message, 'success');
  const command: unknown = Reflect.get(message, 'command');
  const failure: unknown = Reflect.get(message, 'message');

  return {
    ...message,
    type: 'response',
    request_seq: typeof requestSeq === 'number' ? requestSeq : -1,
    success: success === true,
    command: typeof command === 'string' ? command : '',
    ...(typeof failure === 'string' ? { message: failure } : {}),
  };
}
