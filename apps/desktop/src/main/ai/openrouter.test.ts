import { AiCancelledError, AiRequestError, MissingApiKeyError } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertFreeModel,
  forgetCatalog,
  listFreeModels,
  streamCompletion,
} from './openrouter.js';

/**
 * La clave se moquea porque vive detrás de `safeStorage`, que necesita un
 * Electron vivo. Lo que se testea acá es la mitad que habla con la red.
 */
const credentials = vi.hoisted((): { key: string | null } => ({ key: null }));

vi.mock('./credentials.js', () => ({
  loadApiKey: () => Promise.resolve(credentials.key),
}));

/** Un catálogo con un gratuito y uno pago, que es el caso que importa. */
const CATALOG = {
  data: [
    {
      id: 'free/one:free',
      name: 'Uno',
      context_length: 32_768,
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'paid/two',
      name: 'Dos',
      context_length: 128_000,
      pricing: { prompt: '0.000003', completion: '0.000015' },
    },
  ],
};

/** Arma una respuesta de `fetch` con un cuerpo JSON. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Arma una respuesta de streaming con los bloques SSE que se le pasen. */
function sseResponse(blocks: readonly string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      for (const block of blocks) controller.enqueue(encoder.encode(block));

      controller.close();
    },
  });

  return new Response(stream, { status: 200 });
}

/** Un chunk de texto, como bloque SSE listo para mandar. */
function deltaBlock(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  credentials.key = 'sk-or-test';
  forgetCatalog();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listFreeModels', () => {
  it('devuelve sólo los gratuitos', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CATALOG));

    expect(await listFreeModels()).toEqual([
      { id: 'free/one:free', name: 'Uno', contextLength: 32_768 },
    ]);
  });

  it('manda la clave en el header de autorización', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CATALOG));

    await listFreeModels();

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);

    expect(headers.get('Authorization')).toBe('Bearer sk-or-test');
  });

  it('falla con MissingApiKeyError si no hay clave configurada', async () => {
    credentials.key = null;

    await expect(listFreeModels()).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('traduce un rechazo de OpenRouter a AiRequestError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, 401));

    await expect(listFreeModels()).rejects.toBeInstanceOf(AiRequestError);
  });
});

describe('assertFreeModel', () => {
  it('acepta un gratuito y devuelve su ventana de contexto', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CATALOG));

    expect(await assertFreeModel('free/one:free')).toBe(32_768);
  });

  it('rechaza uno que no está entre los gratuitos', async () => {
    // Es el filtro del lado del canal: el de la UI evita el error, éste evita
    // que un renderer comprometido genere un cargo.
    fetchMock.mockResolvedValue(jsonResponse(CATALOG));

    await expect(assertFreeModel('paid/two')).rejects.toBeInstanceOf(AiRequestError);
  });

  it('pide el catálogo una sola vez por sesión', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CATALOG));

    await assertFreeModel('free/one:free');
    await assertFreeModel('free/one:free');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('vuelve a pedirlo después de olvidarlo', async () => {
    // Una respuesta nueva por llamada: el cuerpo de `Response` se consume una
    // sola vez, así que reusar la misma instancia falla en la segunda.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(CATALOG)));

    await assertFreeModel('free/one:free');
    forgetCatalog();
    await assertFreeModel('free/one:free');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('streamCompletion', () => {
  /** Lo mínimo para pedir una respuesta, con un `onDelta` que registra. */
  function request(deltas: string[], signal = new AbortController().signal) {
    return {
      model: 'free/one:free',
      messages: [{ role: 'user' as const, content: 'hola' }],
      onDelta: (text: string) => deltas.push(text),
      signal,
    };
  }

  it('emite cada trozo de texto a medida que llega, y sólo lo nuevo', async () => {
    // Mandar el acumulado en cada chunk sería mandar la respuesta entera N
    // veces por el IPC.
    const deltas: string[] = [];
    fetchMock.mockResolvedValue(sseResponse([deltaBlock('ho'), deltaBlock('la')]));

    const state = await streamCompletion(request(deltas));

    expect(deltas).toEqual(['ho', 'la']);
    expect(state.content).toBe('hola');
  });

  it('recompone un evento partido entre dos chunks de red', async () => {
    const deltas: string[] = [];
    const block = deltaBlock('hola');
    fetchMock.mockResolvedValue(sseResponse([block.slice(0, 20), block.slice(20)]));

    expect((await streamCompletion(request(deltas))).content).toBe('hola');
  });

  it('devuelve las llamadas a herramienta que pidió el modelo', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
        'data: [DONE]\n\n',
      ])
    );

    const state = await streamCompletion(request([]));

    expect(state.toolCalls).toEqual([
      { id: 'call_1', name: 'read_file', arguments: '{"path":"a.ts"}' },
    ]);
  });

  it('declara las herramientas y pide streaming en el cuerpo', async () => {
    fetchMock.mockResolvedValue(sseResponse([deltaBlock('x')]));

    await streamCompletion(request([]));

    const body = fetchMock.mock.calls[0]?.[1]?.body;

    // El cuerpo tiene que ser el JSON que armó `post`; cualquier otra cosa es
    // un bug del cliente y no un test que hay que ablandar.
    expect(typeof body).toBe('string');

    const parsed: unknown = JSON.parse(typeof body === 'string' ? body : '{}');

    expect(parsed).toMatchObject({ stream: true, model: 'free/one:free' });
  });

  it('traduce un 429 a AiRequestError', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));

    await expect(streamCompletion(request([]))).rejects.toBeInstanceOf(AiRequestError);
  });

  it('traduce un aborto a AiCancelledError y no a un error genérico', async () => {
    // Sin esto, cancelar se ve en la UI como "algo salió mal".
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('The operation was aborted'));
    });

    await expect(streamCompletion(request([], controller.signal))).rejects.toBeInstanceOf(
      AiCancelledError
    );
  });

  it('ignora un evento con JSON roto en vez de tirar la respuesta entera', async () => {
    const deltas: string[] = [];
    fetchMock.mockResolvedValue(
      sseResponse([deltaBlock('a'), 'data: {roto\n\n', deltaBlock('b')])
    );

    expect((await streamCompletion(request(deltas))).content).toBe('ab');
  });
});
