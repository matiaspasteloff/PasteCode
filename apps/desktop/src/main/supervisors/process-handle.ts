/**
 * Lo mínimo que el supervisor necesita saber de un proceso hijo.
 *
 * Existe para que `ManagedProcess` no tenga adentro un `if` entre `node-pty` y
 * `node:child_process`. Los dos lanzan procesos y los dos los matan, pero no se
 * parecen en nada más: uno habla por una pseudo-terminal y el otro por tres
 * pipes, uno acepta señales y el otro en Windows no. Todo lo que difiere queda
 * del lado de los adaptadores en `adapters/`.
 *
 * Es deliberadamente pobre. No hay `write`, no hay `onData` y no hay streams:
 * eso es específico de para qué se lanzó el proceso, y ponerlo acá obligaría a
 * cada adaptador a inventar una versión de algo que no tiene. Quien necesita
 * hablarle al proceso lo hace por el handle concreto que devuelve su adaptador.
 */

/** Cómo terminó un proceso. Es el mismo par que ya publica `terminal:exit`. */
export interface ProcessExit {
  readonly exitCode: number;
  /** El número crudo del SO, o `null` si salió por las suyas. En Windows siempre `null`. */
  readonly signal: number | null;
}

/** Un proceso vivo, visto por quien lo supervisa. */
export interface ProcessHandle {
  readonly pid: number;
  /**
   * Le pide al proceso que termine.
   *
   * Es la primera de las dos fases de
   * [RNF-10](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
   * Qué significa "pedir" depende de la plataforma y del tipo de proceso, y eso
   * es justamente lo que cada adaptador resuelve.
   */
  terminate(): void;
  /** La segunda fase: mata sin preguntar. */
  forceKill(): void;
  /**
   * Registra al que se entera de la salida.
   *
   * Se llama una sola vez por proceso. El adaptador garantiza que el listener
   * corre incluso si el proceso ya había muerto cuando se registró, porque si
   * no, un proceso que explota entre el spawn y la suscripción queda colgado
   * para siempre en el mapa de quien lo supervisa.
   */
  onExit(listener: (exit: ProcessExit) => void): void;
}

/**
 * Lanza un proceso. Es lo que `ManagedProcess` vuelve a llamar al reiniciar.
 *
 * Es una función y no una configuración declarativa porque relanzar tiene que
 * producir un handle **nuevo**: los listeners del anterior están atados a un
 * proceso muerto.
 */
export type ProcessSpawner<THandle extends ProcessHandle> = () => THandle;
