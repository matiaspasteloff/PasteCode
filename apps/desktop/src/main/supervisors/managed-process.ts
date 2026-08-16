import { logProcess } from '../services/logger.js';

import type { ProcessExit, ProcessHandle, ProcessSpawner } from './process-handle.js';

/**
 * Cuánto se sondea el estado de salida mientras se espera.
 *
 * Es el mismo intervalo que ya usaba `pty.ts`, por la misma razón: quien vacía
 * el estado es el propio `onExit`, así que esperar a que ese callback corra es
 * exactamente lo que hace falta.
 */
const POLL_INTERVAL_MS = 50;

/** Cómo se lanza, se nombra y se apaga **un** proceso. */
export interface ManagedProcessConfig<THandle extends ProcessHandle> {
  /**
   * Nombre corto para el log. `basename` del ejecutable, nunca la ruta.
   * Ver [`logProcess`](../services/logger.ts).
   */
  readonly name: string;
  readonly spawn: ProcessSpawner<THandle>;
  /** Se llama cuando el proceso muere, por la razón que sea. */
  readonly onExit?: (exit: ProcessExit) => void;
  /**
   * Pedirle al proceso que se apague **por su propio protocolo**, si tiene uno.
   *
   * Es la costura que hace real esta abstracción y no una envoltura de `kill`.
   * Un servidor de lenguaje matado con SIGTERM deja huérfano al `tsserver` que
   * él mismo lanzó; el `shutdown`/`exit` del protocolo es la única forma de que
   * limpie a sus propios hijos. Un PTY no tiene nada parecido y simplemente no
   * define este campo.
   *
   * Puede fallar o colgarse: quien la llama la corre contra el mismo período de
   * gracia que todo lo demás, y si no termina a tiempo se pasa a la señal.
   */
  readonly requestGracefulExit?: (handle: THandle) => Promise<void>;
}

/** Un proceso con ciclo de vida, sin política de reinicio. Eso es la capa de arriba. */
export interface ManagedProcess<THandle extends ProcessHandle> {
  /** El proceso vivo, o `null` si no hay ninguno corriendo ahora mismo. */
  current(): THandle | null;
  /** Lo lanza. Si ya había uno vivo, lo devuelve sin lanzar otro. */
  start(): THandle;
  /**
   * Fase uno del apagado: le pide al proceso que termine.
   *
   * Está separada de `forceKill` para que un pool pueda pedírselo a todos sus
   * procesos y **después** abrir una sola ventana de gracia compartida. Con un
   * `stop()` monolítico por proceso, apagar diez terminales serían diez
   * ventanas en fila.
   */
  requestStop(): Promise<void>;
  /** Fase dos: lo mata, si sigue vivo. */
  forceKill(): void;
  /** Si ya no hay proceso corriendo. */
  hasExited(): boolean;
}

/**
 * Envuelve un proceso hijo con su ciclo de vida.
 *
 * No sabe reiniciar —eso es `SupervisedProcess`— ni sabe que puede haber más de
 * uno —eso es `ProcessPool`—. Lo único que hace es lanzar, avisar cuando muere
 * y apagarse en dos fases, y hacerlo igual para un PTY y para un servidor de
 * lenguaje. Ver [ADR-0016](../../../../../docs/adr/0016-supervisor-de-procesos-generico.md).
 *
 * @param config Cómo lanzarlo, cómo nombrarlo y cómo pedirle que se vaya.
 * @returns El proceso administrado. Todavía sin lanzar: hay que llamar a `start`.
 * @example
 * const managed = createManagedProcess({ name: 'node', spawn: () => adapt(child) });
 * managed.start();
 * await managed.requestStop();
 */
export function createManagedProcess<THandle extends ProcessHandle>(
  config: ManagedProcessConfig<THandle>
): ManagedProcess<THandle> {
  let handle: THandle | null = null;

  return {
    current() {
      return handle;
    },

    start() {
      if (handle !== null) return handle;

      const started = config.spawn();

      handle = started;
      logProcess('spawn', config.name, { pid: started.pid });

      started.onExit((exit) => {
        // Se limpia **antes** de avisar: si quien escucha reacciona
        // preguntando si hay algo corriendo, la respuesta correcta ya es que no.
        // Se compara la identidad porque un reinicio rápido puede haber puesto
        // otro handle acá antes de que llegue este callback.
        if (handle === started) handle = null;

        logProcess('exit', config.name, {
          pid: started.pid,
          exitCode: exit.exitCode,
          signal: exit.signal,
        });
        config.onExit?.(exit);
      });

      return started;
    },

    async requestStop() {
      const dying = handle;

      if (dying === null) return;

      if (config.requestGracefulExit !== undefined) {
        // Si el apagado por protocolo falla, no hay nada que reportar: lo que
        // sigue es matarlo igual, que es lo mismo que habría pasado sin él.
        await config.requestGracefulExit(dying).catch(() => undefined);
        return;
      }

      dying.terminate();
    },

    forceKill() {
      if (handle === null) return;

      logProcess('force-kill', config.name, { pid: handle.pid });
      handle.forceKill();
    },

    hasExited() {
      return handle === null;
    },
  };
}

/**
 * Espera a que una condición se cumpla, o a que se acabe el tiempo.
 *
 * Sondea en vez de contar callbacks por la misma razón que lo hacía `pty.ts`:
 * el estado que interesa lo actualiza el `onExit` de cada proceso, así que
 * mirarlo es esperar exactamente a eso, sin llevar una contabilidad paralela
 * que se puede desincronizar.
 *
 * @param isDone Qué esperar.
 * @param timeoutMs Cuánto, como máximo.
 * @returns Cuando se cumplió o cuando se agotó el tiempo. No distingue: quien
 * llama tiene que mirar el estado igual.
 * @example
 * await waitUntil(() => managed.hasExited(), 3000);
 */
export async function waitUntil(isDone: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!isDone() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
