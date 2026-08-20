import type { Breakpoint, LaunchConfiguration } from '@pastecode/core';
import type {
  DebugOutputEvent,
  DebugStoppedEvent,
  Response as IpcResponse,
} from '@pastecode/ipc-contract';
import type { DebugProtocol } from '@vscode/debugprotocol';

import type { DebugClient } from './client.js';

/** Lo que el orquestador necesita para arrancar y para avisar. */
export interface DebugSessionConfig {
  /**
   * Fabrica el cliente, enganchándole el listener de eventos.
   *
   * Es una fábrica y no un cliente ya hecho porque el listener tiene que
   * apuntar al estado de **esta** sesión, y ese estado no existe hasta que la
   * sesión se crea. Inyectarla es además lo que permite testear la coreografía
   * contra un cliente de mentira sin lanzar ningún proceso.
   */
  readonly createClient: (onEvent: (event: DebugProtocol.Event) => void) => DebugClient;
  /** Raíz del workspace. Va como `cwd` de la configuración. */
  readonly workspaceRoot: string;
  readonly onStopped: (event: DebugStoppedEvent) => void;
  readonly onOutput: (event: DebugOutputEvent) => void;
  readonly onTerminated: () => void;
}

/** Una sesión de debug viva, vista por el IPC. */
export interface DebugSession {
  /** Arranca: `initialize`, `launch`, breakpoints y `configurationDone`. */
  start(configuration: LaunchConfiguration, breakpoints: readonly Breakpoint[]): Promise<void>;
  /** Uno de los cinco controles de RF-503. */
  step(step: 'continue' | 'over' | 'into' | 'out' | 'pause'): Promise<void>;
  /** Reemplaza los breakpoints de un archivo. */
  setBreakpoints(path: string, lines: readonly number[]): Promise<void>;
  /** El call stack del hilo frenado (RF-504). */
  stackTrace(): Promise<IpcResponse<'debug:getStackTrace'>['frames']>;
  /** Los scopes de un frame, o los hijos de una variable (RF-504). */
  variables(
    variablesReference: number | null,
    frameId: number | null
  ): Promise<IpcResponse<'debug:getVariables'>['variables']>;
  /** Evalúa una expresión en el contexto frenado (RF-505). */
  evaluate(expression: string, frameId: number | null): Promise<IpcResponse<'debug:evaluate'>>;
  /** El hilo frenado, o `null` si está corriendo. */
  stoppedThread(): number | null;
  /** La corta a propósito. */
  stop(): Promise<void>;
}

/**
 * El comando de DAP de cada control de la UI.
 *
 * La traducción vive acá y no en el renderer porque el renderer no tiene por
 * qué saber que "step over" se llama `next` en el protocolo. Es el mismo
 * criterio que ya aplica la capa de LSP con sus mapeos.
 */
const DAP_COMMANDS = {
  continue: 'continue',
  over: 'next',
  into: 'stepIn',
  out: 'stepOut',
  pause: 'pause',
} as const;

/** Todo lo que la sesión va cambiando. */
interface SessionState {
  readonly config: DebugSessionConfig;
  /** Los que están esperando un evento del adaptador, por nombre. */
  readonly waiters: Map<string, (() => void)[]>;
  /** El cliente de esta corrida, o `null` si no hay sesión. */
  client: DebugClient | null;
  /** El hilo frenado, o `null` si corre. */
  stoppedThread: number | null;
  /** Si el adaptador dijo que sabe recibir `configurationDone`. */
  supportsConfigurationDone: boolean;
}

/** El cliente de la sesión, o el error de que no hay ninguna. */
function clientOf(state: SessionState): DebugClient {
  if (state.client === null) throw new Error('No hay ninguna sesión de debug corriendo');

  return state.client;
}

/**
 * Crea el orquestador de una sesión de debug.
 *
 * Sabe la **coreografía** de DAP —qué se manda, en qué orden, y qué esperar
 * entre medio— y nada del transporte, que es del cliente. Separarlos es lo que
 * permite testear la coreografía contra un cliente de mentira y el transporte
 * contra un proceso de verdad.
 *
 * @param config El cliente, la raíz, y a quién avisarle.
 * @returns La sesión, todavía sin arrancar.
 * @example
 * const session = createDebugSession({ client, workspaceRoot, onStopped, onOutput, onTerminated });
 */
export function createDebugSession(config: DebugSessionConfig): DebugSession {
  const state: SessionState = {
    config,
    waiters: new Map(),
    client: null,
    stoppedThread: null,
    supportsConfigurationDone: false,
  };

  return {
    start: (configuration, breakpoints) => start(state, configuration, breakpoints),

    async step(step) {
      const threadId = state.stoppedThread;

      // `pause` es el único que se manda mientras corre; los demás sólo tienen
      // sentido frenado. Sin este guard, un click de más manda un `next` sin
      // hilo y el adaptador contesta un error que nadie pidió.
      if (step !== 'pause' && threadId === null) return;

      await clientOf(state).send(DAP_COMMANDS[step], { threadId: threadId ?? 1 });

      if (step !== 'pause') state.stoppedThread = null;
    },

    async setBreakpoints(path, lines) {
      await clientOf(state).send('setBreakpoints', {
        source: { path },
        // DAP reemplaza **todos** los de un archivo: no hay "borrá el de la
        // línea 12". Mandar la lista vacía es cómo se sacan todos.
        breakpoints: lines.map((line) => ({ line })),
      });
    },

    stackTrace: () => stackTrace(state),
    variables: (variablesReference, frameId) => variables(state, variablesReference, frameId),
    evaluate: (expression, frameId) => evaluate(state, expression, frameId),
    stoppedThread: () => state.stoppedThread,

    async stop() {
      const client = state.client;

      if (client === null) return;

      // `disconnect` con `terminateDebuggee` y no `terminate`: es el que todo
      // adaptador implementa, y el que se lleva puesto al programa depurado en
      // vez de dejarlo corriendo sin nadie mirándolo.
      await client.send('disconnect', { terminateDebuggee: true }).catch(() => undefined);
      await client.stop();
      state.client = null;
      state.stoppedThread = null;
    },
  };
}

/**
 * La coreografía del arranque.
 *
 * El orden **no es negociable** y es el que el protocolo define: `initialize`,
 * esperar el evento `initialized`, recién ahí mandar los breakpoints, y cerrar
 * con `configurationDone`. Mandar los breakpoints antes del `initialized` es el
 * error clásico: el adaptador todavía no tiene dónde ponerlos y los descarta en
 * silencio, así que el programa arranca y no frena nunca.
 *
 * El `launch` va **sin esperar** su respuesta, a propósito: varios adaptadores
 * no la contestan hasta que el programa termina de arrancar, y esperarla acá
 * bloquearía el `initialized` que tiene que llegar en el medio.
 */
async function start(
  state: SessionState,
  configuration: LaunchConfiguration,
  breakpoints: readonly Breakpoint[]
): Promise<void> {
  const { workspaceRoot } = state.config;
  const client = state.config.createClient((event) => {
    handleAdapterEvent(state, event);
  });

  state.client = client;
  client.start();

  const initialized = waitForEvent(state, 'initialized');
  const capabilities = await client.send<DebugProtocol.Capabilities>('initialize', {
    adapterID: configuration.type,
    clientID: 'pastecode',
    pathFormat: 'path',
    linesStartAt1: true,
    columnsStartAt1: true,
    supportsRunInTerminalRequest: false,
  });

  state.supportsConfigurationDone = capabilities.supportsConfigurationDoneRequest === true;

  void client
    .send(configuration.request, { cwd: workspaceRoot, ...configuration })
    .catch(() => undefined);

  await initialized;

  await sendAllBreakpoints(state, breakpoints);

  if (state.supportsConfigurationDone) await client.send('configurationDone');
}

/** Manda los breakpoints de cada archivo que tenga alguno. */
async function sendAllBreakpoints(
  state: SessionState,
  breakpoints: readonly Breakpoint[]
): Promise<void> {
  const byPath = new Map<string, number[]>();

  for (const breakpoint of breakpoints) {
    if (!breakpoint.enabled) continue;

    byPath.set(breakpoint.path, [...(byPath.get(breakpoint.path) ?? []), breakpoint.line]);
  }

  for (const [path, lines] of byPath) {
    await clientOf(state).send('setBreakpoints', {
      source: { path },
      breakpoints: lines.map((line) => ({ line })),
    });
  }
}

/** Una promesa que resuelve cuando llegue ese evento. */
function waitForEvent(state: SessionState, event: string): Promise<void> {
  return new Promise((resolve) => {
    state.waiters.set(event, [...(state.waiters.get(event) ?? []), resolve]);
  });
}

/**
 * Atiende un evento del adaptador y lo traduce a lo que el IPC publica.
 *
 * Los que despiertan a un `waitForEvent` se resuelven **antes** de mirar de qué
 * evento se trata: el `initialized` del arranque no hace nada más que eso, y
 * meterlo en la cadena de `if` lo mezclaría con los que sí cambian estado.
 */
function handleAdapterEvent(state: SessionState, event: DebugProtocol.Event): void {
  const pending = state.waiters.get(event.event) ?? [];

  state.waiters.delete(event.event);
  for (const resolve of pending) resolve();

  const handle = EVENT_HANDLERS[event.event];

  handle?.(state, event.body);
}

/**
 * Qué hacer con cada evento que cambia el estado de la sesión.
 *
 * Es una tabla y no una cadena de `if` porque la cadena pasaba el límite de
 * complejidad, y porque agregar un evento del protocolo tiene que ser agregar
 * una entrada y no meter una rama más en una función que ya hace cuatro cosas.
 */
const EVENT_HANDLERS: Record<
  string,
  ((state: SessionState, body: unknown) => void) | undefined
> = {
  stopped: (state, body) => {
    state.stoppedThread = readNumber(body, 'threadId') ?? 1;
    state.config.onStopped({
      threadId: state.stoppedThread,
      reason: readString(body, 'reason') ?? 'unknown',
      // Dónde frenó sale del `stackTrace` y no de este evento: DAP no lo trae
      // acá, y adivinarlo sería inventar una ubicación.
      path: null,
      line: null,
    });
  },

  continued: (state) => {
    state.stoppedThread = null;
  },

  output: (state, body) => {
    state.config.onOutput({
      category: readString(body, 'category') ?? 'console',
      text: readString(body, 'output') ?? '',
    });
  },

  terminated: finish,
  // `exited` es el proceso depurado y `terminated` es la sesión. Casi siempre
  // llegan los dos, en cualquier orden; para el IDE significan lo mismo y
  // `finish` es idempotente.
  exited: finish,
};

/** Cierra la sesión del lado del estado, sin mandarle nada al adaptador. */
function finish(state: SessionState): void {
  state.stoppedThread = null;
  state.client = null;
  state.config.onTerminated();
}

/** El call stack del hilo frenado. */
async function stackTrace(
  state: SessionState
): Promise<IpcResponse<'debug:getStackTrace'>['frames']> {
  if (state.stoppedThread === null) return [];

  const body = await clientOf(state).send<DebugProtocol.StackTraceResponse['body']>(
    'stackTrace',
    {
      threadId: state.stoppedThread,
    }
  );

  return body.stackFrames.map((frame) => ({
    id: frame.id,
    name: frame.name,
    // Un frame de código nativo no tiene archivo. Inventarle uno haría que la
    // UI intente abrir algo que no existe.
    path: frame.source?.path ?? null,
    line: frame.line,
  }));
}

/** Los scopes de un frame, o los hijos de una variable. */
async function variables(
  state: SessionState,
  variablesReference: number | null,
  frameId: number | null
): Promise<IpcResponse<'debug:getVariables'>['variables']> {
  if (variablesReference === null) {
    if (frameId === null) return [];

    const scopes = await clientOf(state).send<DebugProtocol.ScopesResponse['body']>('scopes', {
      frameId,
    });

    // Un scope se ve como una variable expandible: es lo que hace que el panel
    // sea un solo árbol y no dos listas anidadas a mano.
    return scopes.scopes.map((scope) => ({
      name: scope.name,
      value: '',
      variablesReference: scope.variablesReference,
    }));
  }

  const body = await clientOf(state).send<DebugProtocol.VariablesResponse['body']>(
    'variables',
    {
      variablesReference,
    }
  );

  return body.variables.map((variable) => ({
    name: variable.name,
    value: variable.value,
    variablesReference: variable.variablesReference,
  }));
}

/** Evalúa una expresión, devolviendo el error como resultado en vez de lanzar. */
async function evaluate(
  state: SessionState,
  expression: string,
  frameId: number | null
): Promise<IpcResponse<'debug:evaluate'>> {
  try {
    const body = await clientOf(state).send<DebugProtocol.EvaluateResponse['body']>(
      'evaluate',
      {
        expression,
        context: 'repl',
        ...(frameId === null ? {} : { frameId }),
      }
    );

    return { result: body.result, failed: false };
  } catch (cause) {
    // Una expresión mal escrita **no es un error de la aplicación**: es lo
    // normal en una consola. Va como resultado marcado, que es lo que la
    // consola dibuja en rojo sin tratarlo como una falla del IDE.
    return { result: cause instanceof Error ? cause.message : String(cause), failed: true };
  }
}

/** Un campo numérico de un cuerpo desconocido. */
function readNumber(body: unknown, field: string): number | undefined {
  const value = readField(body, field);

  return typeof value === 'number' ? value : undefined;
}

/** Un campo string de un cuerpo desconocido. */
function readString(body: unknown, field: string): string | undefined {
  const value = readField(body, field);

  return typeof value === 'string' ? value : undefined;
}

/** Saca un campo sin asumir que el cuerpo sea un objeto. */
function readField(body: unknown, field: string): unknown {
  if (typeof body !== 'object' || body === null) return undefined;

  return Reflect.get(body, field);
}
