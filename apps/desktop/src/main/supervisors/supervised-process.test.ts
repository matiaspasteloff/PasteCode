import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RestartPolicy } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChildProcessHandle } from './adapters/child-handle.js';
import { adaptChildProcess } from './adapters/child-handle.js';
import { waitUntil } from './managed-process.js';
import type { SupervisedProcess } from './supervised-process.js';
import { createSupervisedProcess } from './supervised-process.js';

const FAKE_SERVER = join(dirname(fileURLToPath(import.meta.url)), 'fake-server.mjs');

const TIMEOUT_MS = 15_000;

/** Backoff mínimo: lo que se verifica es la contabilidad, no el reloj. */
const FAST_POLICY: RestartPolicy = {
  maxAttempts: 3,
  baseDelayMs: 5,
  maxDelayMs: 20,
  healthyAfterMs: 10_000,
};

function spawnFake(...flags: string[]): ChildProcessHandle {
  return adaptChildProcess(spawn(process.execPath, [FAKE_SERVER, ...flags], { shell: false }));
}

describe('createSupervisedProcess', () => {
  let supervised: SupervisedProcess<ChildProcessHandle>;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await supervised.stop(TIMEOUT_MS);
    vi.restoreAllMocks();
  });

  it('lanza el proceso y lo deja disponible', () => {
    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake(),
      policy: FAST_POLICY,
    });

    const handle = supervised.start();

    expect(handle?.pid).toBeGreaterThan(0);
    expect(supervised.current()).toBe(handle);
  });

  it('lo vuelve a levantar cuando se cae', async () => {
    const restarts: number[] = [];
    let spawned = 0;

    supervised = createSupervisedProcess({
      name: 'fake-server',
      // Sólo el primero muere solo: si todos murieran, el test estaría
      // verificando el límite y no el reinicio. Se cuenta en el spawn y no en
      // `restarts`, que se llena **después** de lanzar y dejaría al segundo
      // proceso muriéndose también.
      spawn: () => {
        spawned += 1;

        return spawnFake(...(spawned === 1 ? ['--exit-after=10'] : []));
      },
      policy: FAST_POLICY,
      onRestart: (handle) => restarts.push(handle.pid),
    });

    supervised.start();
    await waitUntil(() => restarts.length > 0, TIMEOUT_MS);

    expect(restarts).toHaveLength(1);
    expect(supervised.current()?.pid).toBe(restarts[0]);
    expect(supervised.hasGivenUp()).toBe(false);
  });

  it('se rinde después de tres intentos y avisa una sola vez', async () => {
    // RNF-09: el proceso no arranca nunca, así que la ventana de "estuvo sano"
    // no se alcanza y los tres intentos se consumen.
    const attempts: number[] = [];

    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--exit-after=5'),
      policy: FAST_POLICY,
      onGiveUp: (count) => attempts.push(count),
    });

    supervised.start();
    await waitUntil(() => supervised.hasGivenUp(), TIMEOUT_MS);

    expect(attempts).toEqual([3]);
    expect(supervised.current()).toBeNull();
  });

  it('no vuelve a lanzar nada después de rendirse', async () => {
    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--exit-after=5'),
      policy: FAST_POLICY,
    });

    supervised.start();
    await waitUntil(() => supervised.hasGivenUp(), TIMEOUT_MS);

    expect(supervised.start()).toBeNull();
  });

  it('deja rastro del abandono con console.error y no con warn', async () => {
    // Rendirse es lo único de todo el ciclo de vida que la persona tiene que
    // poder ver: los reinicios son invisibles y así se quedan.
    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--exit-after=5'),
      policy: FAST_POLICY,
    });

    supervised.start();
    await waitUntil(() => supervised.hasGivenUp(), TIMEOUT_MS);

    expect(console.error).toHaveBeenCalledOnce();
  });

  it('trata al proceso enfermo como un crash y lo reinicia', async () => {
    // El health check pasivo: el cliente avisa que la request más vieja se
    // pasó del timeout, y el proceso entra al mismo camino que una caída.
    const restarts: number[] = [];

    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--lsp', '--hang'),
      policy: FAST_POLICY,
      onRestart: (handle) => restarts.push(handle.pid),
    });

    const first = supervised.start();

    supervised.reportUnhealthy('la request más vieja superó lsp.requestTimeoutMs');
    await waitUntil(() => restarts.length > 0, TIMEOUT_MS);

    expect(restarts[0]).not.toBe(first?.pid);
  });

  it('ignora que se lo declare enfermo si no hay nada corriendo', () => {
    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake(),
      policy: FAST_POLICY,
    });

    expect(() => {
      supervised.reportUnhealthy('nadie');
    }).not.toThrow();
  });

  it('no reinicia después de un apagado deliberado', async () => {
    // Es la distinción que hace que cerrar la app no dispare tres reintentos
    // de algo que pedimos que muriera.
    const restarts: number[] = [];

    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake(),
      policy: FAST_POLICY,
      onRestart: (handle) => restarts.push(handle.pid),
    });

    supervised.start();
    await supervised.stop(TIMEOUT_MS);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(restarts).toEqual([]);
    expect(supervised.current()).toBeNull();
  });

  it('cancela un reinicio pendiente al apagarse', async () => {
    const restarts: number[] = [];

    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--exit-after=10'),
      // Espera larga: el apagado tiene que llegar antes que el temporizador.
      policy: { ...FAST_POLICY, baseDelayMs: 400, maxDelayMs: 400 },
      onRestart: (handle) => restarts.push(handle.pid),
    });

    supervised.start();
    await waitUntil(() => supervised.current() === null, TIMEOUT_MS);
    await supervised.stop(TIMEOUT_MS);
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(restarts).toEqual([]);
  });

  it('tolera que se lo apague sin haberlo lanzado', async () => {
    supervised = createSupervisedProcess({
      name: 'fake-server',
      spawn: () => spawnFake(),
      policy: FAST_POLICY,
    });

    await expect(supervised.stop(TIMEOUT_MS)).resolves.toBeUndefined();
  });
});
