import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dirtyGroupsWith, groupsWith, resetEditorStore } from '../test-support/editor-state.js';
import { installFakeApi } from '../test-support/fake-api.js';

import type { PendingToolCall } from './ai-store.js';
import { useAiStore } from './ai-store.js';
import { useEditorStore } from './editor-store.js';

/** El estado inicial del store, para que un test no arrastre al siguiente. */
function resetStore(): void {
  useAiStore.setState({
    models: [],
    modelId: null,
    mode: 'agent',
    messages: [],
    streamingText: '',
    requestId: null,
    pending: [],
    applied: [],
    hasKey: false,
    canPersist: false,
    isKeyDialogOpen: false,
    error: null,
  });
}

/** La ruta de las propuestas de los tests. */
const PATH = 'C:\\ws\\a.ts';

/** Una propuesta de escritura como la que emite el main. */
function proposal(requestId = 'req-1', toolCallId = 'call_1'): PendingToolCall {
  return {
    requestId,
    toolCallId,
    tool: 'write_file',
    path: PATH,
    nextContent: 'lo nuevo',
    previousContent: 'lo viejo',
    autoApply: false,
  };
}

/** Una propuesta que el main marcó para escribir sin preguntar. */
function autoProposal(toolCallId = 'call_1'): PendingToolCall {
  return { ...proposal('req-1', toolCallId), autoApply: true };
}

/** Las respuestas de los canales que usa una escritura que sale bien. */
const WRITE_OK = {
  'fs:writeFile': { ok: true as const, value: { mtimeMs: 42 } },
  'fs:createFile': {
    ok: true as const,
    value: { entry: { name: 'a.ts', path: PATH, isDirectory: false } },
  },
  'fs:delete': { ok: true as const, value: { path: PATH } },
  'ai:toolResult': { ok: true as const, value: {} },
};

beforeEach(() => {
  resetStore();
  resetEditorStore();
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
      mode: 'agent',
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

describe('addPending con autoApply', () => {
  it('escribe sin pasar por pending', async () => {
    // El permiso viene en el evento y lo decidió el main con `canWriteInMode`:
    // encolarlo para que alguien apriete un botón sería pedir la confirmación
    // que el modo agente justamente saca.
    const invoke = installFakeApi(WRITE_OK);
    useAiStore.setState({ requestId: 'req-1' });

    useAiStore.getState().addPending(autoProposal());
    await vi.waitFor(() => {
      expect(useAiStore.getState().applied).toHaveLength(1);
    });

    expect(useAiStore.getState().pending).toEqual([]);
    expect(invoke).toHaveBeenCalledWith('fs:writeFile', { path: PATH, content: 'lo nuevo' });
  });

  it('encola como siempre cuando el evento no trae autoApply', () => {
    installFakeApi({});
    useAiStore.setState({ requestId: 'req-1' });

    useAiStore.getState().addPending(proposal());

    expect(useAiStore.getState().pending).toHaveLength(1);
    expect(useAiStore.getState().applied).toEqual([]);
  });

  it('le informa al modelo que se aplicó', async () => {
    const invoke = installFakeApi(WRITE_OK);
    useAiStore.setState({ requestId: 'req-1' });

    await useAiStore.getState().applyCall(autoProposal());

    expect(invoke).toHaveBeenCalledWith('ai:toolResult', {
      requestId: 'req-1',
      toolCallId: 'call_1',
      outcome: 'applied',
      detail: '',
    });
  });

  it('se niega a pisar una pestaña con cambios sin guardar', async () => {
    // Es el peligro 1: `fs:writeFile` va sin `expectedMtimeMs`, así que la
    // escritura pisaría lo que la persona escribió, y el `Ctrl+S` siguiente
    // volvería a pisar a la IA.
    const invoke = installFakeApi({ 'ai:toolResult': { ok: true, value: {} } });
    useEditorStore.setState({ groups: dirtyGroupsWith([PATH]) });
    useAiStore.setState({ requestId: 'req-1' });

    await useAiStore.getState().applyCall(autoProposal());

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual(['ai:toolResult']);
    expect(useAiStore.getState().applied).toEqual([]);
    expect(invoke.mock.calls.at(-1)?.[1]).toMatchObject({ outcome: 'failed' });
  });

  it('no guarda checkpoint de una escritura que falló', async () => {
    // Revertir algo que no se escribió dejaría el archivo con el contenido que
    // el modelo quiso poner, que es lo contrario de deshacer.
    installFakeApi({
      'fs:writeFile': {
        ok: false,
        error: { code: 'WRITE_FAILED', userMessage: 'No se pudo escribir.' },
      },
      'ai:toolResult': { ok: true, value: {} },
    });
    useAiStore.setState({ requestId: 'req-1' });

    await useAiStore.getState().applyCall(autoProposal());

    expect(useAiStore.getState().applied).toEqual([]);
  });

  it('adopta el contenido en el editor, que el watcher no va a informar', async () => {
    // Es el peligro 2: `noteOwnWrite` hace que `files:changed` no llegue, y la
    // pestaña abierta se quedaría mostrando el contenido viejo.
    installFakeApi(WRITE_OK);
    useEditorStore.setState({ groups: groupsWith([PATH]) });
    useAiStore.setState({ requestId: 'req-1' });

    await useAiStore.getState().applyCall(autoProposal());

    expect(useEditorStore.getState().pendingFile).toEqual({ path: PATH, content: 'lo nuevo' });
    expect(useEditorStore.getState().mtimes[PATH]).toBe(42);
  });
});

describe('revert', () => {
  it('devuelve el contenido anterior al disco y saca el checkpoint', async () => {
    const invoke = installFakeApi(WRITE_OK);
    useAiStore.setState({ applied: [autoProposal()] });

    await useAiStore.getState().revert('call_1');

    expect(invoke).toHaveBeenCalledWith('fs:writeFile', { path: PATH, content: 'lo viejo' });
    expect(useAiStore.getState().applied).toEqual([]);
  });

  it('manda a la papelera un archivo que la IA había creado', async () => {
    // `fs:delete` usa `shell.trashItem`: deshacer una creación no puede ser un
    // borrado sin vuelta atrás.
    const invoke = installFakeApi(WRITE_OK);
    useAiStore.setState({ applied: [{ ...autoProposal(), previousContent: null }] });

    await useAiStore.getState().revert('call_1');

    expect(invoke).toHaveBeenCalledWith('fs:delete', { path: PATH });
  });

  it('conserva el checkpoint si el disco no dejó revertir', async () => {
    installFakeApi({
      'fs:writeFile': {
        ok: false,
        error: { code: 'WRITE_FAILED', userMessage: 'No se pudo escribir.' },
      },
    });
    useAiStore.setState({ applied: [autoProposal()] });

    await useAiStore.getState().revert('call_1');

    expect(useAiStore.getState().applied).toHaveLength(1);
  });

  it('ignora un checkpoint que ya no está', async () => {
    const invoke = installFakeApi({});

    await useAiStore.getState().revert('call_inexistente');

    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('revertAll', () => {
  it('revierte todo lo del turno', async () => {
    const invoke = installFakeApi(WRITE_OK);
    useAiStore.setState({ applied: [autoProposal('call_1'), autoProposal('call_2')] });

    await useAiStore.getState().revertAll();

    expect(useAiStore.getState().applied).toEqual([]);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'fs:writeFile')).toHaveLength(2);
  });
});

describe('los checkpoints y el final del turno', () => {
  it('finish no borra lo que ya se escribió', () => {
    // Los checkpoints hacen falta justamente después: cuando la persona lee lo
    // que el asistente contó y decide.
    useAiStore.setState({ requestId: 'req-1', applied: [autoProposal()] });

    useAiStore.getState().finish('req-1', null);

    expect(useAiStore.getState().applied).toHaveLength(1);
  });

  it('una conversación nueva sí los tira', () => {
    useAiStore.setState({ applied: [autoProposal()] });

    useAiStore.getState().newChat();

    expect(useAiStore.getState().applied).toEqual([]);
  });
});
