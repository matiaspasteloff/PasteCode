import type { RestartPolicy, RestartState } from '@pastecode/core';
import {
  decideRestart,
  DEFAULT_RESTART_POLICY,
  INITIAL_RESTART_STATE,
  noteStarted,
} from '@pastecode/core';

import { logProcess } from '../services/logger.js';

import type { ManagedProcess, ManagedProcessConfig } from './managed-process.js';
import { createManagedProcess, waitUntil } from './managed-process.js';
import type { ProcessExit, ProcessHandle } from './process-handle.js';

/** Cómo se lanza, se reinicia y se rinde **un** proceso que tiene que estar vivo. */
export interface SupervisedProcessConfig<
  THandle extends ProcessHandle,
> extends ManagedProcessConfig<THandle> {
  /** Los parámetros de reinicio. Por defecto, los de RNF-09. */
  readonly policy?: RestartPolicy;
  /**
   * Se llama con el handle nuevo después de cada reinicio.
   *
   * Es donde un cliente de LSP vuelve a hacer el `initialize` y a reabrir los
   * documentos: un proceso relanzado es un servidor que no sabe nada, y
   * seguirle mandando `didChange` sobre documentos que nunca abrió es la forma
   * más rápida de que se caiga otra vez.
   */
  readonly onRestart?: (handle: THandle) => void;
  /**
   * Se llama cuando se agotaron los intentos.
   *
   * Es el único momento en que la persona tiene que enterarse de algo: hasta
   * ahí, los reinicios son invisibles y así tienen que quedarse.
   */
  readonly onGiveUp?: (attempts: number) => void;
  /** El reloj. Se inyecta para que los tests no dependan del tiempo real. */
  readonly now?: () => number;
}

/** Un proceso que tiene que estar vivo, con reinicio y backoff. */
export interface SupervisedProcess<THandle extends ProcessHandle> {
  /** Lo lanza, si no se rindió antes. */
  start(): THandle | null;
  /** El handle vivo, o `null` si está muerto, reiniciando o rendido. */
  current(): THandle | null;
  /**
   * Declara al proceso enfermo y lo hace pasar por el camino del crash.
   *
   * **Es un health check pasivo, no un ping.** Quien lo llama es el cliente,
   * cuando la request más vieja sin responder supera su timeout. La
   * alternativa —mandarle un `$/pastecode/ping` y esperar respuesta— es
   * abogacía de spec contra servidores que no controlamos: nada obliga a un
   * servidor de lenguaje a contestar un método inventado, y el que no lo haga
   * quedaría marcado como enfermo estando perfectamente sano.
   */
  reportUnhealthy(reason: string): void;
  /** Lo apaga **a propósito**. Un apagado deliberado no reinicia nada. */
  stop(graceMs: number): Promise<void>;
  /** Si ya se agotaron los intentos. Un proceso rendido no se relanza solo. */
  hasGivenUp(): boolean;
}

/**
 * Todo lo que cambia a lo largo de la vida del supervisado.
 *
 * Es un objeto mutable pasado por parámetro y no un puñado de variables en el
 * closure de la fábrica porque el ciclo de reinicio —lanzar, morir, decidir,
 * esperar, lanzar— es recursivo, y escrito adentro de la fábrica no entra en
 * las 50 líneas por función de RNF-20 ni se lee de un vistazo.
 */
interface Supervision<THandle extends ProcessHandle> {
  readonly config: SupervisedProcessConfig<THandle>;
  readonly policy: RestartPolicy;
  readonly now: () => number;
  state: RestartState;
  managed: ManagedProcess<THandle> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  stopping: boolean;
  gaveUp: boolean;
}

/**
 * Crea un proceso supervisado.
 *
 * Es la otra mitad del paso 26, la que `ProcessPool` no es: acá salir es una
 * falla y hay que volver a levantarlo, con el backoff y el límite de tres
 * intentos de [RNF-09](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
 * Toda la aritmética está en `restart-policy` de `packages/core`; lo que queda
 * acá es el temporizador y el hilo con el proceso real.
 * Ver [ADR-0016](../../../../../docs/adr/0016-supervisor-de-procesos-generico.md).
 *
 * @param config Cómo lanzarlo, con qué política y a quién avisarle.
 * @returns El proceso supervisado. Todavía sin lanzar.
 * @example
 * const server = createSupervisedProcess({ name: 'tsserver', spawn, onRestart: reinitialize });
 * server.start();
 */
export function createSupervisedProcess<THandle extends ProcessHandle>(
  config: SupervisedProcessConfig<THandle>
): SupervisedProcess<THandle> {
  const supervision: Supervision<THandle> = {
    config,
    policy: config.policy ?? DEFAULT_RESTART_POLICY,
    now: config.now ?? Date.now,
    state: INITIAL_RESTART_STATE,
    managed: null,
    retryTimer: null,
    stopping: false,
    gaveUp: false,
  };

  return {
    start() {
      if (supervision.gaveUp) return null;

      return launch(supervision);
    },

    current() {
      return supervision.managed?.current() ?? null;
    },

    reportUnhealthy(reason) {
      const handle = supervision.managed?.current();

      if (handle === null || handle === undefined) return;

      logProcess('unhealthy', config.name, { pid: handle.pid, reason });
      // Se lo mata sin pedir permiso: un proceso que dejó de contestar tampoco
      // va a contestar un `shutdown`, y esperarle el período de gracia son tres
      // segundos más de autocompletado muerto. El `onExit` que dispara esto
      // entra al mismo camino de reinicio que un crash, que es el punto.
      handle.forceKill();
    },

    stop(graceMs) {
      return stop(supervision, graceMs);
    },

    hasGivenUp() {
      return supervision.gaveUp;
    },
  };
}

/** Lanza y anota la corrida. Es lo que se repite en el arranque y en cada reinicio. */
function launch<THandle extends ProcessHandle>(supervision: Supervision<THandle>): THandle {
  supervision.managed ??= createManagedProcess({
    ...supervision.config,
    onExit: (exit) => {
      handleExit(supervision, exit);
    },
  });

  const handle = supervision.managed.start();

  supervision.state = noteStarted(supervision.state, supervision.now());

  return handle;
}

/** Decide qué hacer con la salida y, si corresponde, agenda el reintento. */
function handleExit<THandle extends ProcessHandle>(
  supervision: Supervision<THandle>,
  exit: ProcessExit
): void {
  const { config, policy } = supervision;

  config.onExit?.(exit);

  // Un apagado deliberado no es una falla: es lo que pedimos que pasara.
  if (supervision.stopping) return;

  const decision = decideRestart(policy, supervision.state, supervision.now());

  if (decision.kind === 'giveUp') {
    supervision.gaveUp = true;
    logProcess('give-up', config.name, { attempts: decision.attempts });
    config.onGiveUp?.(decision.attempts);
    return;
  }

  supervision.state = decision.state;
  logProcess('restart', config.name, { attempt: decision.attempt, delayMs: decision.delayMs });

  supervision.retryTimer = setTimeout(() => {
    supervision.retryTimer = null;

    if (supervision.stopping) return;

    // El relanzamiento va en su propia sentencia y **no** adentro de
    // `config.onRestart?.(launch(...))`: la llamada opcional no evalúa sus
    // argumentos cuando el callback no existe, así que un supervisado sin
    // `onRestart` —el caso normal de cualquier proceso que no tenga que rehacer
    // un handshake— no se reiniciaría nunca.
    const restarted = launch(supervision);

    config.onRestart?.(restarted);
  }, decision.delayMs);
}

/** Apaga a propósito: cancela el reintento pendiente y no vuelve a levantar nada. */
async function stop<THandle extends ProcessHandle>(
  supervision: Supervision<THandle>,
  graceMs: number
): Promise<void> {
  supervision.stopping = true;

  if (supervision.retryTimer !== null) {
    clearTimeout(supervision.retryTimer);
    supervision.retryTimer = null;
  }

  const { managed } = supervision;

  if (managed === null) return;

  await managed.requestStop();
  await waitUntil(() => managed.hasExited(), graceMs);
  managed.forceKill();
}
