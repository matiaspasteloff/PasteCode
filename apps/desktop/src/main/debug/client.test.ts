import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DebugProtocol } from '@vscode/debugprotocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebugClient } from './client.js';
import { createDebugClient } from './client.js';

/**
 * Techo de tiempo de este archivo, aplicado de verdad.
 *
 * Se lanza un proceso hijo real, así que el arranque de Node entra en la cuenta
 * y el CI de Windows es lento. Va con `vi.setConfig` y no con un tercer
 * argumento por test, por lo mismo que en los demás archivos que lanzan
 * procesos: un test que se agregue mañana lo hereda.
 */
const TIMEOUT_MS = 15_000;

vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

/** El adaptador falso: Node ejecutando el script de al lado. */
const FAKE_ADAPTER = join(dirname(fileURLToPath(import.meta.url)), 'fake-adapter.mjs');

let client: DebugClient;
let events: DebugProtocol.Event[];
let exits: number;

beforeEach(() => {
  events = [];
  exits = 0;

  client = createDebugClient({
    launch: { file: process.execPath, args: [FAKE_ADAPTER], env: { ...process.env } },
    cwd: process.cwd(),
    requestTimeoutMs: 1500,
    onEvent: (event) => events.push(event),
    onExit: () => {
      exits += 1;
    },
  });
});

afterEach(async () => {
  await client.stop();
});

describe('createDebugClient', () => {
  it('no está corriendo hasta que se lo arranca', () => {
    expect(client.isRunning()).toBe(false);
  });

  it('hace un request y recibe su respuesta', async () => {
    client.start();

    const body = await client.send<{ supportsConfigurationDoneRequest: boolean }>(
      'initialize',
      {
        adapterID: 'fake',
      }
    );

    expect(body.supportsConfigurationDoneRequest).toBe(true);
    expect(client.isRunning()).toBe(true);
  });

  it('entrega los eventos al listener', async () => {
    client.start();
    await client.send('initialize', {});

    await vi.waitFor(() => {
      expect(events.map((event) => event.event)).toContain('initialized');
    });
  });

  it('correlaciona por seq y no por orden de llegada', async () => {
    client.start();

    // Se mandan tres a la vez: si el cliente asumiera orden en vez de mirar el
    // `request_seq`, este test pasaría con las respuestas cruzadas.
    const [uno, dos, tres] = await Promise.all([
      client.send<{ n: number }>('eco', { n: 1 }),
      client.send<{ n: number }>('eco', { n: 2 }),
      client.send<{ n: number }>('eco', { n: 3 }),
    ]);

    expect([uno.n, dos.n, tres.n]).toEqual([1, 2, 3]);
  });

  it('sobrevive a un cuerpo con caracteres multibyte', async () => {
    client.start();

    // Es la prueba de que el `Content-Length` se mide en bytes: con acentos y
    // emojis, contar caracteres deja al cliente esperando para siempre.
    const body = await client.send<{ texto: string }>('eco', { texto: 'ñandú 🙂 áéíóú' });

    expect(body.texto).toBe('ñandú 🙂 áéíóú');
  });

  describe('cuando algo sale mal', () => {
    it('rechaza si el adaptador contesta con error, con su mensaje', async () => {
      client.start();

      await expect(client.send('feo')).rejects.toThrow('no quiero');
    });

    it('rechaza por timeout si el adaptador no contesta', async () => {
      client.start();

      await expect(client.send('lento')).rejects.toThrow(/a tiempo/);
    });

    it('rechaza si todavía no se arrancó', async () => {
      await expect(client.send('initialize')).rejects.toThrow(/no está corriendo/);
    });

    it('rechaza lo pendiente y avisa cuando el adaptador muere', async () => {
      client.start();
      await client.send('initialize', {});

      const pendiente = client.send('lento');

      await client.send('morite').catch(() => undefined);

      // Lo que estaba esperando se entera **ahora** y no dentro de un segundo y
      // medio: una sesión de debug cuyo adaptador murió no va a contestar.
      await expect(pendiente).rejects.toThrow(/terminó/);
      await vi.waitFor(() => {
        expect(exits).toBe(1);
      });
    });

    it('un adaptador muerto no se reinicia solo', async () => {
      client.start();
      await client.send('initialize', {});
      await client.send('morite').catch(() => undefined);

      await vi.waitFor(() => {
        expect(client.isRunning()).toBe(false);
      });

      // Un servidor de lenguaje relanzado vuelve a servir; una sesión de debug
      // relanzada perdió el proceso que depuraba, sus breakpoints y su stack.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(client.isRunning()).toBe(false);
    });
  });

  it('un apagado deliberado no avisa de una muerte', async () => {
    client.start();
    await client.send('initialize', {});
    await client.stop();

    expect(exits).toBe(0);
    expect(client.isRunning()).toBe(false);
  });
});
