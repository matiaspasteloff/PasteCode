import { describe, expect, it, vi } from 'vitest';

import type { RpcMessage, RpcRequest, RpcResponse } from './protocol.js';
import { RPC_TIMEOUT_MS } from './protocol.js';
import { createRpcEndpoint } from './rpc.js';

/** Un canal de mentira: guarda lo que se manda en vez de mandarlo a ningún lado. */
function createChannel(): { sent: RpcMessage[]; send: (message: RpcMessage) => void } {
  const sent: RpcMessage[] = [];

  return { sent, send: (message) => sent.push(message) };
}

/** La última request que salió por el canal. Falla el test si no hay ninguna. */
function lastRequest(sent: readonly RpcMessage[]): RpcRequest {
  const message = sent.at(-1);

  if (message?.kind !== 'request') {
    throw new Error('No salió ninguna request por el canal');
  }

  return message;
}

/** La última respuesta que salió por el canal. Falla el test si no hay ninguna. */
function lastResponse(sent: readonly RpcMessage[]): RpcResponse {
  const message = sent.at(-1);

  if (message?.kind !== 'response') {
    throw new Error('No salió ninguna respuesta por el canal');
  }

  return message;
}

describe('createRpcEndpoint', () => {
  describe('correlación', () => {
    it('resuelve cada llamada con la respuesta de su propio id', async () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      const primera = rpc.request('a');
      const segunda = rpc.request('b');

      const [aId, bId] = channel.sent.map((message) =>
        message.kind === 'request' ? message.id : -1
      );

      // A propósito al revés: si el endpoint asumiera orden en vez de
      // correlacionar por id, este test pasaría con las respuestas cruzadas.
      rpc.receive({ kind: 'response', id: bId, result: 'B' });
      rpc.receive({ kind: 'response', id: aId, result: 'A' });

      await expect(primera).resolves.toBe('A');
      await expect(segunda).resolves.toBe('B');
    });

    it('no reusa ids entre llamadas concurrentes', () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      void rpc.request('a');
      void rpc.request('b');
      void rpc.request('c');

      const ids = channel.sent.map((message) => (message.kind === 'request' ? message.id : -1));

      expect(new Set(ids).size).toBe(3);
    });

    it('descarta una respuesta que no corresponde a ninguna llamada', () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      // Es el caso normal después de un timeout: la respuesta llega tarde.
      expect(() => {
        rpc.receive({ kind: 'response', id: 999, result: 'tarde' });
      }).not.toThrow();
    });

    it('ignora lo que no es un mensaje del protocolo', () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      // Del otro lado del canal hay código de terceros.
      for (const basura of [null, undefined, 42, 'hola', {}, { kind: 'otra-cosa' }]) {
        expect(() => {
          rpc.receive(basura);
        }).not.toThrow();
      }

      expect(channel.sent).toHaveLength(0);
    });
  });

  describe('timeout', () => {
    it('rechaza con EXTENSION_CALL_TIMEOUT si nadie contesta', async () => {
      vi.useFakeTimers();

      try {
        const rpc = createRpcEndpoint(createChannel());
        const call = rpc.request('se-cuelga');

        vi.advanceTimersByTime(RPC_TIMEOUT_MS);

        await expect(call).rejects.toMatchObject({ code: 'EXTENSION_CALL_TIMEOUT' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('no rechaza a una llamada que contestó a tiempo', async () => {
      vi.useFakeTimers();

      try {
        const channel = createChannel();
        const rpc = createRpcEndpoint(channel);
        const call = rpc.request('rápida');

        rpc.receive({ kind: 'response', id: lastRequest(channel.sent).id, result: 'ok' });
        vi.advanceTimersByTime(RPC_TIMEOUT_MS * 2);

        await expect(call).resolves.toBe('ok');
        expect(rpc.pendingCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('handlers', () => {
    it('contesta con lo que devuelve el handler', async () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      rpc.handle('sumar', (params) => Number(params) + 1);
      rpc.receive({ kind: 'request', id: 7, method: 'sumar', params: 41 });
      await vi.waitFor(() => {
        expect(channel.sent).toHaveLength(1);
      });

      expect(lastResponse(channel.sent)).toEqual({ kind: 'response', id: 7, result: 42 });
    });

    it('contesta con error cuando el handler lanza, sin propagar', async () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      rpc.handle('rota', () => {
        throw new Error('se rompió');
      });
      rpc.receive({ kind: 'request', id: 1, method: 'rota', params: null });
      await vi.waitFor(() => {
        expect(channel.sent).toHaveLength(1);
      });

      expect(lastResponse(channel.sent).error).toEqual({
        code: 'HANDLER_FAILED',
        message: 'se rompió',
      });
    });

    it('contesta UNKNOWN_METHOD en vez de dejar colgado a quien llamó', async () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);

      rpc.receive({ kind: 'request', id: 3, method: 'no-existe', params: null });
      await vi.waitFor(() => {
        expect(channel.sent).toHaveLength(1);
      });

      expect(lastResponse(channel.sent).error?.code).toBe('UNKNOWN_METHOD');
    });

    it('propaga el error del otro lado a quien llamó', async () => {
      const channel = createChannel();
      const rpc = createRpcEndpoint(channel);
      const call = rpc.request('falla');

      rpc.receive({
        kind: 'response',
        id: lastRequest(channel.sent).id,
        error: { code: 'CAPABILITY_DENIED', message: 'sin documentWrite' },
      });

      await expect(call).rejects.toThrow('sin documentWrite');
    });
  });

  describe('dispose', () => {
    it('rechaza todo lo pendiente cuando el otro lado muere', async () => {
      const rpc = createRpcEndpoint(createChannel());
      const primera = rpc.request('a');
      const segunda = rpc.request('b');

      rpc.dispose('el host crasheó');

      await expect(primera).rejects.toMatchObject({ code: 'EXTENSION_HOST_UNAVAILABLE' });
      await expect(segunda).rejects.toMatchObject({ code: 'EXTENSION_HOST_UNAVAILABLE' });
      expect(rpc.pendingCount()).toBe(0);
    });

    it('rechaza en el acto las llamadas que llegan después', async () => {
      const rpc = createRpcEndpoint(createChannel());

      rpc.dispose('el host se rindió');

      // Sin esperar el timeout: encolar contra un host rendido es una cola que
      // crece para siempre.
      await expect(rpc.request('tarde')).rejects.toMatchObject({
        code: 'EXTENSION_HOST_UNAVAILABLE',
      });
    });
  });
});
