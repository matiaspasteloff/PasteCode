import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adaptChildProcess } from './adapters/child-handle.js';
import type { ManagedProcess } from './managed-process.js';
import { createManagedProcess, waitUntil } from './managed-process.js';
import type { ProcessExit } from './process-handle.js';

/** El servidor falso: Node ejecutando el script de al lado. */
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

/** Lanza el servidor falso con las banderas que pida el caso. */
function spawnFake(...flags: string[]) {
  return adaptChildProcess(spawn(process.execPath, [FAKE_SERVER, ...flags], { shell: false }));
}

describe('createManagedProcess', () => {
  let exits: ProcessExit[];
  let managed: ManagedProcess<ReturnType<typeof spawnFake>>;

  beforeEach(() => {
    exits = [];
    // El log de ciclo de vida sale por console.warn a propósito; en los tests
    // sólo ensucia la salida.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    managed.forceKill();
    await waitUntil(() => managed.hasExited(), TIMEOUT_MS);
    vi.restoreAllMocks();
  });

  it('lanza el proceso y devuelve su handle con pid', () => {
    managed = createManagedProcess({ name: 'fake-server', spawn: () => spawnFake() });

    const handle = managed.start();

    expect(handle.pid).toBeGreaterThan(0);
    expect(managed.current()).toBe(handle);
    expect(managed.hasExited()).toBe(false);
  });

  it('no lanza un segundo proceso si ya hay uno vivo', () => {
    managed = createManagedProcess({ name: 'fake-server', spawn: () => spawnFake() });

    expect(managed.start()).toBe(managed.start());
  });

  it('avisa la salida y se olvida del proceso muerto', async () => {
    managed = createManagedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--exit-after=10'),
      onExit: (exit) => exits.push(exit),
    });

    managed.start();
    await waitUntil(() => exits.length > 0, TIMEOUT_MS);

    expect(exits[0]?.exitCode).toBe(1);
    expect(managed.current()).toBeNull();
    expect(managed.hasExited()).toBe(true);
  });

  it('avisa la salida aunque el ejecutable no exista', async () => {
    // El spawn que falla emite `error` y puede no emitir `close`. Sin la guarda
    // que escucha los dos, este caso deja el proceso colgado para siempre.
    managed = createManagedProcess({
      name: 'no-existe',
      spawn: () =>
        adaptChildProcess(spawn(join(dirname(FAKE_SERVER), 'no-existe.mjs'), { shell: false })),
      onExit: (exit) => exits.push(exit),
    });

    managed.start();
    await waitUntil(() => exits.length > 0, TIMEOUT_MS);

    expect(exits).toHaveLength(1);
    expect(managed.hasExited()).toBe(true);
  });

  it('termina el proceso cuando se le pide que pare', async () => {
    managed = createManagedProcess({
      name: 'fake-server',
      spawn: () => spawnFake(),
      onExit: (exit) => exits.push(exit),
    });

    managed.start();
    await managed.requestStop();
    await waitUntil(() => managed.hasExited(), TIMEOUT_MS);

    expect(managed.hasExited()).toBe(true);
  });

  it('usa el apagado por protocolo en vez de la señal cuando hay uno', async () => {
    // Es la costura que hace real la abstracción: un servidor de lenguaje se
    // apaga por `shutdown`/`exit`, no por SIGTERM, o deja huérfano a tsserver.
    const graceful = vi.fn(async (handle: ReturnType<typeof spawnFake>) => {
      handle.stdin.write(framed({ jsonrpc: '2.0', method: 'exit' }));
      await waitUntil(() => managed.hasExited(), TIMEOUT_MS);
    });

    managed = createManagedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--lsp'),
      requestGracefulExit: graceful,
    });

    managed.start();
    await managed.requestStop();

    expect(graceful).toHaveBeenCalledOnce();
    expect(managed.hasExited()).toBe(true);
  });

  it('sigue adelante si el apagado por protocolo falla', async () => {
    // Que falle no cambia nada: lo que viene después es matarlo igual.
    managed = createManagedProcess({
      name: 'fake-server',
      spawn: () => spawnFake(),
      requestGracefulExit: () => Promise.reject(new Error('el servidor no contestó')),
    });

    managed.start();
    await expect(managed.requestStop()).resolves.toBeUndefined();

    managed.forceKill();
    await waitUntil(() => managed.hasExited(), TIMEOUT_MS);
    expect(managed.hasExited()).toBe(true);
  });

  it('mata al que ignora el pedido de terminar', async () => {
    // RNF-10: la escalada. En Windows no hay señales y `terminate` ya mata, así
    // que lo que se verifica es que el proceso termina en las dos plataformas.
    managed = createManagedProcess({
      name: 'fake-server',
      spawn: () => spawnFake('--ignore-term'),
    });

    managed.start();
    await managed.requestStop();
    await waitUntil(() => managed.hasExited(), 300);

    managed.forceKill();
    await waitUntil(() => managed.hasExited(), TIMEOUT_MS);

    expect(managed.hasExited()).toBe(true);
  });

  it('tolera que se le pida parar o matar cuando no hay nada corriendo', async () => {
    managed = createManagedProcess({ name: 'fake-server', spawn: () => spawnFake() });

    await expect(managed.requestStop()).resolves.toBeUndefined();
    expect(() => {
      managed.forceKill();
    }).not.toThrow();
  });
});

describe('waitUntil', () => {
  it('vuelve cuando se cumple la condición', async () => {
    let done = false;

    setTimeout(() => {
      done = true;
    }, 20);

    await waitUntil(() => done, TIMEOUT_MS);

    expect(done).toBe(true);
  });

  it('vuelve igual si se acaba el tiempo, sin lanzar', async () => {
    // Quien llama mira el estado después: distinguir acá obligaría a cada
    // consumidor a atajar una excepción que no cambia lo que va a hacer.
    await expect(waitUntil(() => false, 60)).resolves.toBeUndefined();
  });
});

/** Arma un mensaje LSP con su framing, para hablarle al servidor falso. */
function framed(message: unknown): string {
  const body = JSON.stringify(message);

  return `Content-Length: ${String(Buffer.byteLength(body, 'utf8'))}\r\n\r\n${body}`;
}
