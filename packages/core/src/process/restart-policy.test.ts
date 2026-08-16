import { describe, expect, it } from 'vitest';

import type { RestartPolicy, RestartState } from './restart-policy.js';
import {
  backoffDelay,
  decideRestart,
  DEFAULT_RESTART_POLICY,
  INITIAL_RESTART_STATE,
  noteStarted,
} from './restart-policy.js';

/** Una política con números redondos, para que las cuentas se lean solas. */
const POLICY: RestartPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  healthyAfterMs: 5000,
};

/** Simula una corrida completa: arrancó en `startedAt`, murió `ranFor` después. */
function afterRun(state: RestartState, startedAt: number, ranFor: number) {
  return decideRestart(POLICY, noteStarted(state, startedAt), startedAt + ranFor);
}

describe('backoffDelay', () => {
  it('espera la base en el primer intento', () => {
    expect(backoffDelay(POLICY, 1)).toBe(100);
  });

  it('duplica la espera en cada intento', () => {
    expect(backoffDelay(POLICY, 2)).toBe(200);
    expect(backoffDelay(POLICY, 3)).toBe(400);
    expect(backoffDelay(POLICY, 4)).toBe(800);
  });

  it('no pasa del techo por más intentos que haya', () => {
    expect(backoffDelay(POLICY, 20)).toBe(1000);
  });

  it('trata un intento cero o negativo como el primero', () => {
    // No debería llegar nunca, pero devolver `NaN` o una espera de cero
    // convertiría un error de contabilidad en un bucle apretado de spawns.
    expect(backoffDelay(POLICY, 0)).toBe(100);
    expect(backoffDelay(POLICY, -1)).toBe(100);
  });

  it('da los 500ms, 1s y 2s documentados con la política por defecto', () => {
    const delays = [1, 2, 3].map((attempt) => backoffDelay(DEFAULT_RESTART_POLICY, attempt));

    expect(delays).toEqual([500, 1000, 2000]);
  });
});

describe('noteStarted', () => {
  it('registra el momento de arranque sin tocar el contador', () => {
    // Haber arrancado no prueba nada: si resetear pasara acá, un proceso que
    // muere apenas nace nunca agotaría los intentos.
    const state = noteStarted({ attempt: 2, startedAt: null }, 1000);

    expect(state).toEqual({ attempt: 2, startedAt: 1000 });
  });
});

describe('decideRestart', () => {
  it('reintenta la primera vez, con la espera base', () => {
    const decision = afterRun(INITIAL_RESTART_STATE, 0, 10);

    expect(decision).toEqual({
      kind: 'restart',
      delayMs: 100,
      attempt: 1,
      state: { attempt: 1, startedAt: null },
    });
  });

  it('acumula intentos y esperas mientras el proceso siga muriendo rápido', () => {
    let state = INITIAL_RESTART_STATE;
    const delays: number[] = [];

    for (let run = 0; run < 3; run += 1) {
      const decision = afterRun(state, run * 20, 10);

      if (decision.kind !== 'restart') throw new Error('se rindió antes de tiempo');

      delays.push(decision.delayMs);
      state = decision.state;
    }

    expect(delays).toEqual([100, 200, 400]);
  });

  it('se rinde después del tercer intento', () => {
    // RNF-09: tres intentos y se avisa. El cuarto crash ya no relanza nada.
    let state = INITIAL_RESTART_STATE;

    for (let run = 0; run < 3; run += 1) {
      const decision = afterRun(state, run * 20, 10);

      if (decision.kind !== 'restart') throw new Error('se rindió antes de tiempo');

      state = decision.state;
    }

    expect(afterRun(state, 100, 10)).toEqual({ kind: 'giveUp', attempts: 3 });
  });

  it('vuelve a empezar de cero si la corrida duró lo suficiente', () => {
    // El caso que hace la diferencia entre un límite útil y uno que deja
    // muerto para siempre a un servidor que anduvo toda la mañana.
    const decision = afterRun({ attempt: 3, startedAt: null }, 0, POLICY.healthyAfterMs);

    expect(decision).toEqual({
      kind: 'restart',
      delayMs: 100,
      attempt: 1,
      state: { attempt: 1, startedAt: null },
    });
  });

  it('no considera sana una corrida que no llegó al umbral por un milisegundo', () => {
    const decision = afterRun({ attempt: 2, startedAt: null }, 0, POLICY.healthyAfterMs - 1);

    if (decision.kind !== 'restart') throw new Error('no debería rendirse todavía');

    expect(decision.attempt).toBe(3);
  });

  it('no considera sano un proceso que nunca llegó a arrancar', () => {
    // `startedAt` en `null` es un spawn que falló. Contarlo como sano dejaría
    // reintentando para siempre un ejecutable que no existe.
    const decision = decideRestart(POLICY, { attempt: 3, startedAt: null }, 999_999);

    expect(decision).toEqual({ kind: 'giveUp', attempts: 3 });
  });
});
