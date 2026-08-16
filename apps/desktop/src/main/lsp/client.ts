import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import type { LanguageServerDefinition } from '@pastecode/core';
import type { LspServerStatus } from '@pastecode/ipc-contract';
import type { MessageConnection } from 'vscode-jsonrpc/node';
import { CancellationTokenSource, createMessageConnection } from 'vscode-jsonrpc/node';
import type {
  InitializeParams,
  InitializeResult,
  PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol';

import type { ChildProcessHandle } from '../supervisors/adapters/child-handle.js';
import { adaptChildProcess } from '../supervisors/adapters/child-handle.js';
import type { SupervisedProcess } from '../supervisors/supervised-process.js';
import { createSupervisedProcess } from '../supervisors/supervised-process.js';

import { CLIENT_CAPABILITIES } from './capabilities.js';
import type { ServerLaunch } from './resolve-server-path.js';

/** Cuánto se espera el `shutdown` antes de pasar a la señal. */
const GRACEFUL_EXIT_TIMEOUT_MS = 1000;

/** Cómo se levanta y a quién le habla un cliente. */
export interface LanguageClientOptions {
  readonly definition: LanguageServerDefinition;
  readonly launch: ServerLaunch;
  /** Raíz del workspace. Es el `cwd` y el `rootUri`. */
  readonly root: string;
  readonly initializationOptions: Record<string, unknown>;
  /** Umbral del health check pasivo. Sale de `lsp.requestTimeoutMs`. */
  readonly requestTimeoutMs: number;
  readonly onDiagnostics: (params: PublishDiagnosticsParams) => void;
  readonly onStatus: (status: LspServerStatus) => void;
}

/** Un servidor de lenguaje vivo, visto por el resto del main. */
export interface LanguageClient {
  readonly serverId: string;
  status(): LspServerStatus;
  start(): void;
  /** Manda una notificación. Se encola hasta que el handshake termine. */
  notify(method: string, params: unknown): void;
  /**
   * Manda un request, cancelando el anterior del mismo método.
   *
   * @returns La respuesta, o `null` si el servidor no está, falló o canceló.
   */
  request<TResult>(method: string, params: unknown): Promise<TResult | null>;
  stop(graceMs: number): Promise<void>;
}

/** Una promesa que se resuelve desde afuera. Se rehace en cada reinicio. */
interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

/** Todo lo que cambia a lo largo de la vida del cliente. */
interface ClientRuntime {
  readonly options: LanguageClientOptions;
  supervised: SupervisedProcess<ChildProcessHandle> | null;
  connection: MessageConnection | null;
  /** Resuelve con la conexión lista, o con `null` si no la va a haber. */
  ready: Deferred<MessageConnection | null>;
  /** Un token por método: pedir de nuevo cancela el anterior. */
  readonly pending: Map<string, CancellationTokenSource>;
  state: LspServerStatus['state'];
  userMessage: string | null;
  /** Si el apagado es deliberado. Un apagado a propósito no espera un reinicio. */
  stopping: boolean;
}

/**
 * Crea el cliente de un servidor de lenguaje.
 *
 * El ciclo de vida del proceso no está acá: lo pone `createSupervisedProcess`,
 * con el backoff y el límite de tres intentos de RNF-09. Lo que este módulo
 * agrega es el protocolo —el handshake, la verificación del `positionEncoding`,
 * el apagado por `shutdown`/`exit` y el health check pasivo—, que es
 * exactamente la costura que `requestGracefulExit` y `onRestart` dejaron
 * abierta. Ver [ADR-0017](../../../../../docs/adr/0017-cliente-lsp-con-vscode-jsonrpc.md).
 *
 * @param options Cómo lanzarlo y a quién avisarle.
 * @returns El cliente. Todavía sin arrancar.
 * @example
 * const client = createLanguageClient({ definition, launch, root, ... });
 * client.start();
 */
export function createLanguageClient(options: LanguageClientOptions): LanguageClient {
  const runtime: ClientRuntime = {
    options,
    supervised: null,
    connection: null,
    ready: createDeferred(),
    pending: new Map(),
    state: 'starting',
    userMessage: null,
    stopping: false,
  };

  runtime.supervised = superviseServer(runtime);

  return {
    serverId: options.definition.serverId,

    status() {
      return {
        serverId: options.definition.serverId,
        state: runtime.state,
        userMessage: runtime.userMessage,
      };
    },

    start() {
      const handle = runtime.supervised?.start() ?? null;

      if (handle !== null) void connect(runtime, handle);
    },

    notify(method, params) {
      // Se encola sobre la misma promesa que todo lo demás, así que dos
      // notificaciones seguidas llegan en orden: los `then` de una promesa
      // corren en el orden en que se registraron. Sin esto, un `didChange` que
      // se resolviera antes que su `didOpen` desincroniza al servidor.
      void runtime.ready.promise.then((connection) =>
        connection?.sendNotification(method, params)
      );
    },

    request(method, params) {
      return request(runtime, method, params);
    },

    async stop(graceMs) {
      runtime.stopping = true;
      runtime.ready.resolve(null);
      await runtime.supervised?.stop(graceMs);
      setState(runtime, 'stopped', null);
    },
  };
}

/**
 * Ata el ciclo de vida del proceso al del protocolo.
 *
 * Los cuatro callbacks son las cuatro costuras que `ADR-0016` dejó abiertas: el
 * apagado por protocolo, el `initialize` de cada relanzamiento, la limpieza de
 * la conexión muerta y el aviso cuando ya no hay más intentos.
 */
function superviseServer(runtime: ClientRuntime): SupervisedProcess<ChildProcessHandle> {
  const { definition } = runtime.options;

  return createSupervisedProcess<ChildProcessHandle>({
    // El `serverId` y no el ejecutable: para el módulo empaquetado el archivo
    // es el binario de Electron, que en el log no dice nada.
    name: definition.serverId,
    spawn: () => adaptChildProcess(spawnServer(runtime.options)),
    requestGracefulExit: (handle) => requestGracefulExit(runtime, handle),
    onExit: () => {
      detach(runtime);
    },
    onRestart: (handle) => {
      void connect(runtime, handle);
    },
    onGiveUp: () => {
      runtime.ready.resolve(null);
      fail(runtime, `El servidor de ${definition.serverId} se cayó y no pudo reiniciarse.`);
    },
  });
}

/** Lanza el proceso. Argumentos como array y `shell: false`, siempre. */
function spawnServer(options: LanguageClientOptions): ChildProcessWithoutNullStreams {
  return spawn(options.launch.file, [...options.launch.args], {
    cwd: options.root,
    shell: false,
    env: options.launch.env,
  });
}

/**
 * Arma la conexión sobre los pipes del proceso y hace el handshake.
 *
 * El `initialize` va **antes** de que `ready` se resuelva, así que todo lo que
 * el resto del main haya pedido mientras tanto sale recién ahora y en orden.
 */
async function connect(runtime: ClientRuntime, handle: ChildProcessHandle): Promise<void> {
  const connection = createMessageConnection(handle.stdout, handle.stdin);

  connection.onNotification(
    'textDocument/publishDiagnostics',
    (params: PublishDiagnosticsParams) => {
      runtime.options.onDiagnostics(params);
    }
  );
  connection.listen();
  runtime.connection = connection;

  // Se captura **este** deferred y no se lee `runtime.ready` al final: si el
  // proceso muere durante el handshake, `detach` ya lo resolvió y puso otro
  // para el reinicio. Resolver el de después con el resultado del de antes
  // dejaría al servidor recién levantado marcado como muerto.
  const pending = runtime.ready;

  try {
    const result = await connection.sendRequest<InitializeResult>(
      'initialize',
      initializeParams(runtime.options)
    );

    if (runtime.connection !== connection) return;

    const rejection = encodingProblem(runtime.options.definition, result);

    if (rejection !== null) {
      pending.resolve(null);
      fail(runtime, rejection);
      await runtime.supervised?.stop(GRACEFUL_EXIT_TIMEOUT_MS);
      return;
    }

    void connection.sendNotification('initialized', {});
    pending.resolve(connection);
    setState(runtime, 'running', null);
  } catch (cause) {
    console.error(`[lsp] ${runtime.options.definition.serverId} falló el initialize:`, cause);
    pending.resolve(null);
  }
}

/** Los parámetros del `initialize`. */
function initializeParams(options: LanguageClientOptions): InitializeParams {
  const uri = pathToFileURL(options.root).toString();

  return {
    processId: process.pid,
    clientInfo: { name: 'PasteCode' },
    rootUri: uri,
    workspaceFolders: [{ uri, name: 'workspace' }],
    capabilities: CLIENT_CAPABILITIES,
    initializationOptions: options.initializationOptions,
  };
}

/**
 * Verifica el `positionEncoding` que negoció el servidor.
 *
 * La ausencia es UTF-16 por spec, así que sólo se rechaza un valor distinto y
 * explícito. Rechazar es mejor que seguir: un servidor que cuenta en unidades
 * UTF-8 no falla, corre cada columna en cualquier archivo con un emoji.
 */
function encodingProblem(
  definition: LanguageServerDefinition,
  result: InitializeResult
): string | null {
  const encoding = result.capabilities.positionEncoding;

  if (encoding === undefined || encoding === 'utf-16') return null;

  return `El servidor de ${definition.serverId} sólo trabaja en ${encoding}, y PasteCode necesita utf-16. Se desactivó para no marcar errores en el lugar equivocado.`;
}

/**
 * Manda un request con cancelación por método.
 *
 * **Single-flight por `(serverId, método)`**: pedir un completado nuevo cancela
 * el anterior con `$/cancelRequest`, que es lo que hace que tipear rápido no
 * deje diez análisis corriendo en paralelo. No hace falta un canal
 * renderer→main para cancelar porque el evento que cancela es la request
 * siguiente, y esa ya viene.
 */
async function request<TResult>(
  runtime: ClientRuntime,
  method: string,
  params: unknown
): Promise<TResult | null> {
  const connection = await runtime.ready.promise;

  if (connection === null) return null;

  runtime.pending.get(method)?.cancel();

  const source = new CancellationTokenSource();
  runtime.pending.set(method, source);

  // El health check pasivo de `SupervisedProcess`: si la respuesta no llega en
  // el timeout, el servidor está colgado y se lo manda al camino del crash. No
  // se le manda un ping inventado porque nada obliga a un servidor a
  // contestarlo, y el que no lo haga quedaría marcado enfermo estando sano.
  const timer = setTimeout(() => {
    runtime.supervised?.reportUnhealthy(`${method} sin responder`);
  }, runtime.options.requestTimeoutMs);

  try {
    return await connection.sendRequest<TResult>(method, params, source.token);
  } catch {
    // Cancelar es lo normal, no un error: quien pidió esto ya no lo quiere.
    return null;
  } finally {
    clearTimeout(timer);
    if (runtime.pending.get(method) === source) runtime.pending.delete(method);
    source.dispose();
  }
}

/**
 * Le pide al servidor que se apague por su propio protocolo.
 *
 * Es la razón de que `requestGracefulExit` exista: un servidor matado con
 * SIGTERM deja huérfano al `tsserver` que él mismo lanzó. La carrera contra el
 * temporizador tampoco es opcional —un servidor colgado no contesta el
 * `shutdown`— y sin ella el apagado de la app se quedaría esperando para
 * siempre en vez de escalar a la señal.
 */
async function requestGracefulExit(
  runtime: ClientRuntime,
  handle: ChildProcessHandle
): Promise<void> {
  const { connection } = runtime;

  if (connection === null) {
    handle.terminate();
    return;
  }

  try {
    await Promise.race([
      connection.sendRequest('shutdown').then(() => connection.sendNotification('exit')),
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('shutdown timeout'));
        }, GRACEFUL_EXIT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    handle.terminate();
  }
}

/**
 * Suelta la conexión muerta y desbloquea a todo el que estuviera esperándola.
 *
 * El deferred se rehace **sólo si hay un reinicio en camino**. Rehacerlo
 * siempre es el bug sutil de esta clase: sobre un servidor apagado a propósito
 * o marcado `failed` no viene ninguna conexión más, así que cada request
 * posterior se quedaría esperando para siempre en vez de devolver `null`.
 */
function detach(runtime: ClientRuntime): void {
  runtime.ready.resolve(null);

  if (!runtime.stopping && runtime.state !== 'failed') runtime.ready = createDeferred();

  for (const source of runtime.pending.values()) source.cancel();
  runtime.pending.clear();

  runtime.connection?.dispose();
  runtime.connection = null;
}

/** Marca el servidor como fallado y lo cuenta. Es terminal y visible. */
function fail(runtime: ClientRuntime, userMessage: string): void {
  setState(runtime, 'failed', userMessage);
}

/** Cambia el estado y lo publica. */
function setState(
  runtime: ClientRuntime,
  state: LspServerStatus['state'],
  userMessage: string | null
): void {
  // Un servidor que ya falló no vuelve a `stopped` ni a `running` por un
  // callback tardío del supervisor: el motivo del fallo es lo que hay que
  // seguir mostrando.
  if (runtime.state === 'failed' && state !== 'failed') return;

  runtime.state = state;
  runtime.userMessage = userMessage;
  runtime.options.onStatus({
    serverId: runtime.options.definition.serverId,
    state,
    userMessage,
  });
}

/** Una promesa con su `resolve` afuera. */
function createDeferred<TValue>(): Deferred<TValue> {
  let resolve: (value: TValue) => void = () => undefined;

  const promise = new Promise<TValue>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}
