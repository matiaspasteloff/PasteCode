import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChildProcessHandle } from './adapters/child-handle.js';
import { adaptChildProcess } from './adapters/child-handle.js';
import { waitUntil } from './managed-process.js';
import type { ProcessPool } from './process-pool.js';
import { createProcessPool } from './process-pool.js';

const FAKE_SERVER = join(dirname(fileURLToPath(import.meta.url)), 'fake-server.mjs');

/**
 * Techo de tiempo de este archivo, **aplicado de verdad**.
 *
 * `vi.setConfig` y no un tercer argumento en cada `it()`: la constante estaba
 * declarada desde el principio y no se le pasaba a ninguno, así que vitest
 * mataba los tests a los 5 s por omisión y el techo era decorativo. Configurarlo
 * una vez por archivo cierra la clase entera de error — un test que se agregue
 * mañana lo hereda sin que nadie se acuerde.
 */
const TIMEOUT_MS = 15_000;

vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

function spawnFake(...flags: string[]): ChildProcessHandle {
  return adaptChildProcess(spawn(process.execPath, [FAKE_SERVER, ...flags], { shell: false }));
}

describe('createProcessPool', () => {
  let pool: ProcessPool<string, ChildProcessHandle>;

  beforeEach(() => {
    pool = createProcessPool<string, ChildProcessHandle>();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await pool.disposeAll(TIMEOUT_MS);
    vi.restoreAllMocks();
  });

  it('lanza y registra un proceso bajo su clave', () => {
    const handle = pool.add('a', { name: 'fake-server', spawn: () => spawnFake() });

    expect(pool.get('a')).toBe(handle);
    expect(pool.keys()).toEqual(['a']);
  });

  it('devuelve undefined para una clave que no existe', () => {
    expect(pool.get('nadie')).toBeUndefined();
  });

  it('saca del pool al que se murió, antes de avisar', async () => {
    // El orden importa: si quien escucha reacciona pidiendo la lista, el que
    // acaba de morir no puede seguir apareciendo.
    let keysWhenNotified: string[] = ['sin llamar'];

    pool.add('a', {
      name: 'fake-server',
      spawn: () => spawnFake('--exit-after=10'),
      onExit: () => {
        keysWhenNotified = pool.keys();
      },
    });

    await waitUntil(() => pool.keys().length === 0, TIMEOUT_MS);

    expect(keysWhenNotified).toEqual([]);
  });

  it('no registra la clave si el spawn falla', () => {
    expect(() => {
      pool.add('a', {
        name: 'roto',
        spawn: () => {
          throw new Error('no se pudo lanzar');
        },
      });
    }).toThrow('no se pudo lanzar');

    expect(pool.keys()).toEqual([]);
  });

  it('termina el proceso que se le pide sacar', async () => {
    pool.add('a', { name: 'fake-server', spawn: () => spawnFake() });
    pool.add('b', { name: 'fake-server', spawn: () => spawnFake() });

    pool.remove('a');
    await waitUntil(() => !pool.keys().includes('a'), TIMEOUT_MS);

    expect(pool.keys()).toEqual(['b']);
  });

  it('tolera que se le pida sacar una clave que no existe', () => {
    expect(() => {
      pool.remove('nadie');
    }).not.toThrow();
  });

  it('deja cero procesos vivos al apagar, aunque no respondan', async () => {
    // RNF-10 con varios a la vez: es el caso que importa. Tres procesos que
    // ignoran el pedido de terminar y que igual tienen que morir.
    for (const key of ['a', 'b', 'c']) {
      pool.add(key, { name: 'fake-server', spawn: () => spawnFake('--ignore-term') });
    }

    expect(pool.keys()).toHaveLength(3);

    await pool.disposeAll(200);
    await waitUntil(() => pool.keys().length === 0, TIMEOUT_MS);

    expect(pool.keys()).toEqual([]);
  });

  it('apaga contra una sola ventana y no una por proceso', async () => {
    // Con tres procesos y una ventana de 300ms, la suma daría 900ms. Se mide
    // con holgura: lo que se está verificando es que no hay ventanas en fila.
    for (const key of ['a', 'b', 'c']) {
      pool.add(key, { name: 'fake-server', spawn: () => spawnFake('--ignore-term') });
    }

    const started = Date.now();
    await pool.disposeAll(300);

    expect(Date.now() - started).toBeLessThan(800);
  });
});
