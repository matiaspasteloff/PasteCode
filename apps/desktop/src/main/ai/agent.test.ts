import type { CompletionState } from '@pastecode/core';
import { AiCancelledError, EMPTY_COMPLETION } from '@pastecode/core';
import type { Request } from '@pastecode/ipc-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventRecipient } from '../ipc/emitter.js';

import { cancelAgent, resolveToolCall, runAgent } from './agent.js';
import type { WireMessage } from './openrouter.js';

/**
 * Lo que devuelve el cliente, guionado por test.
 *
 * Se moquea la capa de red entera y no `fetch`: lo que se verifica acá es el
 * **loop** —cuándo se ejecuta una herramienta, cuándo se pide confirmación y
 * qué se le cuenta al modelo—, y para eso la respuesta es la entrada.
 */
const client = vi.hoisted(
  (): { turns: CompletionState[]; sent: WireMessage[][]; contextLength: number } => ({
    turns: [],
    sent: [],
    contextLength: 8192,
  })
);

vi.mock('./openrouter.js', () => ({
  assertFreeModel: () => Promise.resolve(client.contextLength),
  streamCompletion: (request: {
    messages: WireMessage[];
    onDelta: (text: string) => void;
    signal: AbortSignal;
  }) => {
    client.sent.push([...request.messages]);

    const turn = client.turns.shift() ?? EMPTY_COMPLETION;

    if (request.signal.aborted) return Promise.reject(new AiCancelledError());
    if (turn.content !== '') request.onDelta(turn.content);

    return Promise.resolve(turn);
  },
}));

const tools = vi.hoisted(
  (): { readResult: string; readError: Error | null; previousContent: string | null } => ({
    readResult: 'contenido del archivo',
    readError: null,
    previousContent: 'lo que hay hoy',
  })
);

vi.mock('./workspace-tools.js', () => ({
  runReadOnlyTool: () => {
    if (tools.readError !== null) return Promise.reject(tools.readError);

    return Promise.resolve(tools.readResult);
  },
  resolveWriteProposal: () =>
    Promise.resolve({
      path: 'C:\\ws\\a.ts',
      nextContent: 'lo nuevo',
      previousContent: tools.previousContent,
    }),
}));

/** Un evento que la ventana recibió. */
interface Emitted {
  channel: string;
  payload: unknown;
}

/** Una ventana falsa. `emit` sólo necesita esta forma. */
function fakeWindow(emitted: Emitted[]): EventRecipient {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => {
        emitted.push({ channel, payload });
      },
    },
  };
}

/** Un turno del modelo con sólo texto. */
function textTurn(content: string): CompletionState {
  return { content, toolCalls: [], finishReason: 'stop' };
}

/** Un turno del modelo que pide una herramienta. */
function toolTurn(name: string, args = '{}', id = 'call_1'): CompletionState {
  return {
    content: '',
    toolCalls: [{ id, name, arguments: args }],
    finishReason: 'tool_calls',
  };
}

/** El payload de `ai:chat` de un test. */
function chat(requestId = 'req-1'): Request<'ai:chat'> {
  return {
    requestId,
    model: 'free/one:free',
    messages: [{ role: 'user', content: 'hola' }],
  };
}

/** Los eventos de un canal, en orden. */
function only(emitted: readonly Emitted[], channel: string): unknown[] {
  return emitted.filter((event) => event.channel === channel).map((event) => event.payload);
}

/**
 * Una propiedad de un payload que llegó como `unknown`.
 *
 * Existe para no escribir una aserción de tipo, que codigo.md prohíbe también
 * en los tests: los payloads salen del `send` de la ventana falsa, que los
 * recibe sin tipo, y estrecharlos a mano una vez es más barato que un `as` por
 * aserto.
 */
function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}

/** Ídem, cuando lo que se espera es texto. Devuelve `''` si no lo es. */
function textField(value: unknown, name: string): string {
  const found = field(value, name);

  return typeof found === 'string' ? found : '';
}

beforeEach(() => {
  client.turns = [];
  client.sent = [];
  client.contextLength = 8192;
  tools.readResult = 'contenido del archivo';
  tools.readError = null;
  tools.previousContent = 'lo que hay hoy';
});

describe('runAgent', () => {
  it('emite el texto y cierra con ai:done sin error', async () => {
    const emitted: Emitted[] = [];
    client.turns = [textTurn('hola, ¿en qué te ayudo?')];

    await runAgent(chat(), fakeWindow(emitted));

    expect(only(emitted, 'ai:delta')).toEqual([
      { requestId: 'req-1', text: 'hola, ¿en qué te ayudo?' },
    ]);
    expect(only(emitted, 'ai:done')).toEqual([{ requestId: 'req-1', error: null }]);
  });

  it('le pone el prompt de sistema adelante de la conversación', async () => {
    client.turns = [textTurn('ok')];

    await runAgent(chat(), fakeWindow([]));

    expect(client.sent[0]?.[0]?.role).toBe('system');
    expect(client.sent[0]?.[1]?.role).toBe('user');
    expect(client.sent[0]?.[1]?.content).toBe('hola');
  });

  it('ejecuta una herramienta de lectura sin pedir confirmación', async () => {
    // Las de lectura se resuelven enteras en el main: no hay diff que aprobar
    // porque no hay nada que escribir.
    const emitted: Emitted[] = [];
    client.turns = [toolTurn('read_file', '{"path":"a.ts"}'), textTurn('dice esto')];

    await runAgent(chat(), fakeWindow(emitted));

    expect(only(emitted, 'ai:toolCall')).toEqual([]);
    const result = client.sent[1]?.at(-1);

    expect(result?.role).toBe('tool');
    expect(result?.tool_call_id).toBe('call_1');
    expect(result?.content).toBe('contenido del archivo');
  });

  it('no escribe: emite ai:toolCall con el diff y espera', async () => {
    // Es RF-1006. Mientras nadie conteste, el loop no avanza.
    const emitted: Emitted[] = [];
    client.turns = [toolTurn('write_file', '{"path":"a.ts","content":"lo nuevo"}')];

    const pending = runAgent(chat(), fakeWindow(emitted));
    await vi.waitFor(() => {
      expect(only(emitted, 'ai:toolCall')).toHaveLength(1);
    });

    expect(only(emitted, 'ai:toolCall')[0]).toEqual({
      requestId: 'req-1',
      toolCallId: 'call_1',
      tool: 'write_file',
      path: 'C:\\ws\\a.ts',
      nextContent: 'lo nuevo',
      previousContent: 'lo que hay hoy',
    });
    expect(only(emitted, 'ai:done')).toEqual([]);

    client.turns.push(textTurn('listo'));
    resolveToolCall({
      requestId: 'req-1',
      toolCallId: 'call_1',
      outcome: 'applied',
      detail: '',
    });

    await pending;
    expect(only(emitted, 'ai:done')).toHaveLength(1);
  });

  it('le dice al modelo que el cambio se descartó, no que se aplicó', async () => {
    // Sin esto el modelo sigue como si hubiera escrito, y la respuesta final
    // habla de un archivo que no cambió.
    const emitted: Emitted[] = [];
    client.turns = [toolTurn('write_file', '{"path":"a.ts","content":"x"}')];

    const pending = runAgent(chat(), fakeWindow(emitted));
    await vi.waitFor(() => {
      expect(only(emitted, 'ai:toolCall')).toHaveLength(1);
    });

    client.turns.push(textTurn('entendido'));
    resolveToolCall({
      requestId: 'req-1',
      toolCallId: 'call_1',
      outcome: 'discarded',
      detail: '',
    });
    await pending;

    expect(client.sent[1]?.at(-1)?.content).toContain('quedó como estaba');
  });

  it('rechaza create_file sobre un archivo que ya existe, sin preguntar nada', async () => {
    const emitted: Emitted[] = [];
    client.turns = [
      toolTurn('create_file', '{"path":"a.ts","content":"x"}'),
      textTurn('ah, ya existía'),
    ];

    await runAgent(chat(), fakeWindow(emitted));

    expect(only(emitted, 'ai:toolCall')).toEqual([]);
    expect(client.sent[1]?.at(-1)?.content).toContain('ya existe');
  });

  it('le cuenta al modelo cuando la herramienta falla, en vez de cortar', async () => {
    const emitted: Emitted[] = [];
    tools.readError = new Error('ENOENT: no existe');
    client.turns = [toolTurn('read_file', '{"path":"no.ts"}'), textTurn('no está')];

    await runAgent(chat(), fakeWindow(emitted));

    expect(only(emitted, 'ai:done')).toEqual([{ requestId: 'req-1', error: null }]);
    expect(client.sent[1]?.at(-1)?.content).toContain('ENOENT');
  });

  it('le avisa al modelo cuando se inventa una herramienta', async () => {
    client.turns = [toolTurn('rm_rf', '{}'), textTurn('perdón')];

    await runAgent(chat(), fakeWindow([]));

    expect(client.sent[1]?.at(-1)?.content).toContain('No existe una herramienta');
  });

  it('cierra con el error serializado cuando la respuesta falla', async () => {
    const emitted: Emitted[] = [];
    client.turns = [toolTurn('write_file', '{"path":"a.ts","content":"x"}')];

    const pending = runAgent(chat(), fakeWindow(emitted));
    await vi.waitFor(() => {
      expect(only(emitted, 'ai:toolCall')).toHaveLength(1);
    });

    cancelAgent('req-1');
    await pending;

    expect(textField(field(only(emitted, 'ai:done')[0], 'error'), 'code')).toBe('AI_CANCELLED');
  });

  it('ignora una respuesta de confirmación que ya no espera nadie', () => {
    expect(() => {
      resolveToolCall({
        requestId: 'req-inexistente',
        toolCallId: 'call_1',
        outcome: 'applied',
        detail: '',
      });
    }).not.toThrow();
  });

  it('corta después de demasiadas vueltas de herramientas y lo dice', async () => {
    // Un modelo en bucle consumiría la cuota gratuita sin producir nada.
    const emitted: Emitted[] = [];
    client.turns = Array.from({ length: 20 }, () => toolTurn('read_file', '{"path":"a.ts"}'));

    await runAgent(chat(), fakeWindow(emitted));

    expect(textField(only(emitted, 'ai:delta').at(-1), 'text')).toContain(
      'demasiadas herramientas'
    );
    expect(only(emitted, 'ai:done')).toEqual([{ requestId: 'req-1', error: null }]);
  });
});
