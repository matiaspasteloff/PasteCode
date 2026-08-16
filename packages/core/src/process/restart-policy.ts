/**
 * Cuándo, cuánto y hasta cuándo reintentar un proceso que se murió.
 *
 * Es la parte del supervisor del [paso 26](../../../../docs/00-guia-paso-a-paso.md#etapa-4--inteligencia-de-lenguaje-y-git)
 * que no necesita un proceso para existir, y por eso vive acá: el backoff, el
 * límite de intentos y la regla de "estuvo vivo el tiempo suficiente, borrón y
 * cuenta nueva" son aritmética sobre un contador y dos marcas de tiempo.
 * Separarlo es lo que permite testear el comportamiento que importa —que a los
 * tres intentos se rinde, que el cuarto crash después de una hora sana vuelve a
 * empezar de cero— sin lanzar nada ni esperar segundos de reloj.
 */

/** Los parámetros de la política. Todo es dato: no hay nada configurable en código. */
export interface RestartPolicy {
  /**
   * Cuántas veces seguidas se reintenta antes de rendirse.
   *
   * Son los 3 intentos textuales de
   * [RNF-09](../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
   */
  readonly maxAttempts: number;
  /** Espera del primer reintento, en milisegundos. Los siguientes duplican. */
  readonly baseDelayMs: number;
  /** Techo de la espera. Sin él, el intento 20 esperaría seis días. */
  readonly maxDelayMs: number;
  /**
   * Cuánto tiene que durar una corrida para considerarse sana.
   *
   * Es lo que distingue "arranca y explota" de "anduvo toda la mañana y se
   * cayó una vez": lo primero se rinde a los tres intentos, lo segundo tiene
   * que poder reiniciarse indefinidamente.
   */
  readonly healthyAfterMs: number;
}

/**
 * El estado que el supervisor arrastra entre corridas.
 *
 * `startedAt` es `null` mientras no hay nada corriendo. Es un campo y no un
 * booleano al lado porque el cálculo de "duró lo suficiente" necesita el
 * momento, no el hecho.
 */
export interface RestartState {
  readonly attempt: number;
  readonly startedAt: number | null;
}

/** Qué hacer con un proceso que acaba de morir. */
export type RestartDecision =
  | {
      readonly kind: 'restart';
      /** Cuánto esperar antes de volver a lanzarlo. */
      readonly delayMs: number;
      /** Qué número de intento es el que viene. Va al log estructurado. */
      readonly attempt: number;
      readonly state: RestartState;
    }
  | {
      readonly kind: 'giveUp';
      /** Cuántos intentos se consumieron. Va al mensaje que ve la persona. */
      readonly attempts: number;
    };

/**
 * Los valores por defecto.
 *
 * Con estos números las esperas son 500ms, 1s y 2s: los tres intentos de
 * RNF-09 se consumen en tres segundos y medio, que es rápido para un servidor
 * de lenguaje que arranca bien y no es un bucle apretado para uno que no.
 */
export const DEFAULT_RESTART_POLICY: RestartPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 15_000,
  healthyAfterMs: 10_000,
};

/** El estado de algo que todavía no arrancó nunca. */
export const INITIAL_RESTART_STATE: RestartState = { attempt: 0, startedAt: null };

/**
 * La espera de un intento dado.
 *
 * **Exponencial y sin jitter, a propósito.** El jitter existe para
 * desincronizar una flota de clientes que reintentan contra el mismo servidor;
 * acá hay un proceso hijo en una máquina de escritorio, así que lo único que
 * aportaría es volver no determinista el único test que puede verificar que el
 * backoff crece.
 *
 * @param policy Los parámetros vigentes.
 * @param attempt Número de intento, empezando en 1.
 * @returns Milisegundos a esperar, nunca más que `maxDelayMs`.
 * @example
 * backoffDelay(DEFAULT_RESTART_POLICY, 1); // 500
 * backoffDelay(DEFAULT_RESTART_POLICY, 3); // 2000
 */
export function backoffDelay(policy: RestartPolicy, attempt: number): number {
  if (attempt <= 1) return policy.baseDelayMs;

  return Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
}

/**
 * Anota que el proceso arrancó.
 *
 * El contador de intentos **no** se toca acá: haber arrancado no prueba nada
 * todavía. Un servidor que muere al medio segundo de arrancar arranca igual, y
 * resetear en este punto convertiría el límite de tres intentos en un bucle
 * infinito de spawns.
 *
 * @param state El estado anterior.
 * @param now El reloj, inyectado.
 * @returns El estado con la corrida en curso registrada.
 * @example
 * noteStarted(INITIAL_RESTART_STATE, 1000); // { attempt: 0, startedAt: 1000 }
 */
export function noteStarted(state: RestartState, now: number): RestartState {
  return { attempt: state.attempt, startedAt: now };
}

/**
 * Decide qué hacer con un proceso que salió.
 *
 * La regla de "estuvo sano" se aplica **antes** de contar el intento: una
 * corrida que duró más que `healthyAfterMs` deja el contador en cero, así que
 * el reintento que sigue es el primero y no el cuarto. Sin eso, un servidor de
 * lenguaje que se cae una vez por hora quedaría permanentemente muerto después
 * de tres horas de uso normal, que es exactamente el comportamiento que nadie
 * espera de un límite pensado para los que no arrancan.
 *
 * @param policy Los parámetros vigentes.
 * @param state El estado, con la corrida que acaba de terminar.
 * @param exitedAt Cuándo salió, del mismo reloj que `noteStarted`.
 * @returns Reintentar con su espera, o rendirse.
 * @example
 * const running = noteStarted(INITIAL_RESTART_STATE, 0);
 * decideRestart(DEFAULT_RESTART_POLICY, running, 100);
 * // { kind: 'restart', delayMs: 500, attempt: 1, state: { attempt: 1, startedAt: null } }
 */
export function decideRestart(
  policy: RestartPolicy,
  state: RestartState,
  exitedAt: number
): RestartDecision {
  const consumed = wasHealthy(policy, state, exitedAt) ? 0 : state.attempt;
  const attempt = consumed + 1;

  if (attempt > policy.maxAttempts) return { kind: 'giveUp', attempts: consumed };

  return {
    kind: 'restart',
    delayMs: backoffDelay(policy, attempt),
    attempt,
    state: { attempt, startedAt: null },
  };
}

/**
 * Si la corrida que terminó duró lo suficiente como para no contar.
 *
 * Un `startedAt` en `null` es un proceso que nunca llegó a anotarse —falló el
 * spawn—, y eso nunca es sano.
 */
function wasHealthy(policy: RestartPolicy, state: RestartState, exitedAt: number): boolean {
  if (state.startedAt === null) return false;

  return exitedAt - state.startedAt >= policy.healthyAfterMs;
}
