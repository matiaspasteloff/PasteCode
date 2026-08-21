import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import type { PendingToolCall } from './ai-store.js';
import { useAiStore } from './ai-store.js';

/** El estado inicial del store, para que un test no arrastre al siguiente. */
function resetStore(): void {
  useAiStore.setState({
    models: [],
    modelId: null,
    messages: [],
    streamingText: '',
    requestId: null,
    pending: [],
    hasKey: false,
    canPersist: false,
    isKeyDialogOpen: false,
    error: null,
  });
}

/** Una propuesta de escritura como la que emite el main. */
function proposal(requestId = 'req-1', toolCallId = 'call_1'): PendingToolCall {
  return {
    requestId,
    toolCallId,
    tool: 'write_file',
    path: 'C:\\ws\\a.ts',
    nextContent: 'lo nuevo',
    previousContent: 'lo viejo',
  };
}

beforeEach(() => {
  resetStore();
});

describe('send', () => {
  it('agrega la pregunta y arranca la respuesta con un requestId propio', async () => {
    const invoke = installFakeApi({ 'ai:chat': { ok: true, value: {} } });
    useAiStore.setState({ modelId: 'x:free' });

    await useAiStore.getState().send('hola');

    const state = useAiStore.getState();

    expect(state.messages).toEqual([{ role: 'user', content: 'hola' }]);
    expect(state.requestId).not.toBeNull();
    expect(invoke).toHaveBeenCalledWith('ai:chat', {
      requestId: state.requestId,
      model: 'x:free',
      messages: [{ role: 'user', content: 'hola' }],
    });
  });

  it('manda la conversación entera, no sólo el último mensaje', async () => {
    // El main no guarda historial a propósito: sin estado compartido entre
    // procesos no hay estado que se pueda desincronizar.
    const invoke = installFakeApi({ 'ai:chat': { ok: true, value: {} } });
    useAiStore.setState({
      modelId: 'x:free',
      messages: [
        { role: 'user', content: 'uno' },
        { role: 'assistant', content: 'dos' },
      ],
    });

    await useAiStore.getState().send('tres');

    expect(invoke.mock.calls[0]?.[1]).toMatchObject({
      messages: [
        { role: 'user', content: 'uno' },
        { role: 'assistant', content: 'dos' },
        { role: 'user', content: 'tres' },
      ],
    });
  });

  it('no manda nada sin modelo elegido', async () => {
    const invoke = installFakeApi({});

    await useAiStore.getState().send('hola');

    expect(useAiStore.getState().messages).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('no manda una segunda pregunta con una respuesta en curso', async () => {
    // Dos streams pintando sobre el mismo lugar es una respuesta ilegible.
    const invoke = installFakeApi({});
    useAiStore.setState({ modelId: 'x:free', requestId: 'req-1' });

    await useAiStore.getState().send('otra');

    expect(invoke).not.toHaveBeenCalled();
  });

  it('cierra la pregunta a mano si el canal falla', async () => {
    // El final normal llega por `ai:done`, que no va a llegar nunca si el
    // canal ni siquiera arrancó.
    installFakeApi({
      'ai:chat': {
        ok: false,
        error: { code: 'AI_MISSING_API_KEY', userMessage: 'Falta la clave' },
      },
    });
    useAiStore.setState({ modelId: 'x:free' });

    await useAiStore.getState().send('hola');

    expect(useAiStore.getState().requestId).toBeNull();
    expect(useAiStore.getState().error?.code).toBe('AI_MISSING_API_KEY');
  });
});

describe('appendDelta', () => {
  it('concatena los trozos de la pregunta en curso', () => {
    useAiStore.setState({ requestId: 'req-1' });

    useAiStore.getState().appendDelta('req-1', 'ho');
    useAiStore.getState().appendDelta('req-1', 'la');

    expect(useAiStore.getState().streamingText).toBe('hola');
  });

  it('tira lo que llega de una pregunta que ya no es la actual', () => {
    // Entre que se cancela y que el fetch se aborta, el servidor sigue
    // escribiendo: sin esto, esos deltas se pintan sobre la conversación nueva.
    useAiStore.setState({ requestId: 'req-2' });

    useAiStore.getState().appendDelta('req-1', 'viejo');

    expect(useAiStore.getState().streamingText).toBe('');
  });
});

describe('finish', () => {
  it('cierra el mensaje en vuelo y lo suma a la conversación', () => {
    useAiStore.setState({ requestId: 'req-1', streamingText: 'listo' });

    useAiStore.getState().finish('req-1', null);

    const state = useAiStore.getState();

    expect(state.messages).toEqual([{ role: 'assistant', content: 'listo' }]);
    expect(state.streamingText).toBe('');
    expect(state.requestId).toBeNull();
  });

  it('conserva lo que se alcanzó a escribir aunque haya fallado', () => {
    useAiStore.setState({ requestId: 'req-1', streamingText: 'a medias' });

    useAiStore.getState().finish('req-1', { code: 'AI_CANCELLED', userMessage: 'Se canceló.' });

    expect(useAiStore.getState().messages).toEqual([
      { role: 'assistant', content: 'a medias' },
    ]);
    expect(useAiStore.getState().error?.code).toBe('AI_CANCELLED');
  });

  it('no agrega un mensaje vacío cuando no llegó nada', () => {
    useAiStore.setState({ requestId: 'req-1' });

    useAiStore.getState().finish('req-1', null);

    expect(useAiStore.getState().messages).toEqual([]);
  });

  it('descarta las propuestas que quedaron sin contestar', () => {
    useAiStore.setState({ requestId: 'req-1', pending: [proposal()] });

    useAiStore.getState().finish('req-1', null);

    expect(useAiStore.getState().pending).toEqual([]);
  });
});

describe('addPending', () => {
  it('suma la propuesta de la pregunta en curso', () => {
    useAiStore.setState({ requestId: 'req-1' });

    useAiStore.getState().addPending(proposal());

    expect(useAiStore.getState().pending).toHaveLength(1);
  });

  it('tira la de una pregunta que ya no es la actual', () => {
    useAiStore.setState({ requestId: 'req-2' });

    useAiStore.getState().addPending(proposal('req-1'));

    expect(useAiStore.getState().pending).toEqual([]);
  });
});

describe('answerToolCall', () => {
  it('contesta al main y saca la propuesta de la lista', async () => {
    const invoke = installFakeApi({ 'ai:toolResult': { ok: true, value: {} } });
    useAiStore.setState({ requestId: 'req-1', pending: [proposal()] });

    await useAiStore.getState().answerToolCall('call_1', 'discarded', '');

    expect(useAiStore.getState().pending).toEqual([]);
    expect(invoke).toHaveBeenCalledWith('ai:toolResult', {
      requestId: 'req-1',
      toolCallId: 'call_1',
      outcome: 'discarded',
      detail: '',
    });
  });

  it('ignora una propuesta que ya no está', async () => {
    const invoke = installFakeApi({});

    await useAiStore.getState().answerToolCall('call_inexistente', 'applied', '');

    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('loadModels', () => {
  it('conserva el modelo elegido si sigue en el catálogo', async () => {
    // El catálogo gratuito cambia sin aviso; el que sigue estando no tiene por
    // qué perderse.
    installFakeApi({
      'ai:listModels': {
        ok: true,
        value: {
          models: [
            { id: 'a:free', name: 'A', contextLength: 8192 },
            { id: 'b:free', name: 'B', contextLength: 8192 },
          ],
        },
      },
    });
    useAiStore.setState({ modelId: 'b:free' });

    await useAiStore.getState().loadModels();

    expect(useAiStore.getState().modelId).toBe('b:free');
  });

  it('cae al primero cuando el elegido ya no está', async () => {
    installFakeApi({
      'ai:listModels': {
        ok: true,
        value: { models: [{ id: 'a:free', name: 'A', contextLength: 8192 }] },
      },
    });
    useAiStore.setState({ modelId: 'desaparecido:free' });

    await useAiStore.getState().loadModels();

    expect(useAiStore.getState().modelId).toBe('a:free');
  });
});
