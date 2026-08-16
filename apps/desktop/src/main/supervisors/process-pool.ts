import type { ManagedProcess, ManagedProcessConfig } from './managed-process.js';
import { createManagedProcess, waitUntil } from './managed-process.js';
import type { ProcessHandle } from './process-handle.js';

/**
 * N procesos del mismo tipo, donde salir es normal.
 *
 * Es la mitad del paso 26 que corresponde al PTY: un pool de sesiones que la
 * persona abre y cierra a voluntad, y donde que una muera no es una falla ni
 * dispara ningún reintento. La otra mitad —**un** proceso que tiene que estar
 * vivo, y cuya salida es una falla— es `SupervisedProcess`, y no comparte nada
 * con ésta salvo `ManagedProcess`. Meterlas en la misma clase habría producido
 * un objeto con la mitad de sus métodos siempre inaplicables.
 * Ver [ADR-0016](../../../../../docs/adr/0016-supervisor-de-procesos-generico.md).
 */
export interface ProcessPool<TKey, THandle extends ProcessHandle> {
  /** Lanza uno y lo registra con esa clave. */
  add(key: TKey, config: ManagedProcessConfig<THandle>): THandle;
  /** El handle vivo de esa clave, o `undefined` si no hay. */
  get(key: TKey): THandle | undefined;
  /** Las claves de los procesos vivos. */
  keys(): TKey[];
  /** Le pide a uno que termine. No se lo saca del mapa: eso lo hace su salida. */
  remove(key: TKey): void;
  /**
   * Apaga todos, en dos fases y con **una sola** ventana de gracia.
   *
   * Compartir la ventana no es una optimización: tres subsistemas con tres
   * ventanas de tres segundos son nueve segundos entre que alguien hace click
   * en la X y la ventana desaparece, que es tiempo más que suficiente para que
   * Windows dibuje el diálogo de "el programa no responde".
   */
  disposeAll(graceMs: number): Promise<void>;
}

/**
 * Crea un pool vacío.
 *
 * Es una fábrica y no un módulo con estado por lo mismo que ya era una fábrica
 * el supervisor de PTY: deja tener uno por test sin resetear nada global.
 *
 * @returns El pool, sin procesos.
 * @example
 * const pool = createProcessPool<string, PtyHandle>();
 * pool.add('terminal-1', { name: 'powershell', spawn: () => adaptPty(pty) });
 * await pool.disposeAll(3000);
 */
export function createProcessPool<TKey, THandle extends ProcessHandle>(): ProcessPool<
  TKey,
  THandle
> {
  const members = new Map<TKey, ManagedProcess<THandle>>();

  return {
    add(key, config) {
      const managed = createManagedProcess({
        ...config,
        onExit: (exit) => {
          // Se saca del mapa **antes** de avisar: si quien escucha reacciona
          // pidiendo la lista, el que acaba de morir no tiene que aparecer.
          members.delete(key);
          config.onExit?.(exit);
        },
      });

      // Se lanza **antes** de registrarlo: si el spawn falla, lo que
      // corresponde es propagar el error con el pool intacto y no dejar
      // registrada una clave cuyo proceso no existe.
      const handle = managed.start();

      members.set(key, managed);

      return handle;
    },

    get(key) {
      return members.get(key)?.current() ?? undefined;
    },

    keys() {
      return [...members.keys()];
    },

    remove(key) {
      // No se borra del mapa acá: el borrado sale del `onExit`, que es el único
      // momento en que el proceso está muerto de verdad. Borrarlo antes dejaría
      // un proceso vivo que ya nadie puede matar, que es justo lo que RF-305
      // prohíbe.
      void members.get(key)?.requestStop();
    },

    async disposeAll(graceMs) {
      // Se le pide a **todos** primero y recién después se espera una vez. Al
      // revés —pedir, esperar, pedir, esperar— el apagado tardaría la suma de
      // las ventanas en vez del máximo.
      const dying = [...members.values()];

      await Promise.all(dying.map((managed) => managed.requestStop()));
      await waitUntil(() => members.size === 0, graceMs);

      for (const managed of members.values()) managed.forceKill();
    },
  };
}
