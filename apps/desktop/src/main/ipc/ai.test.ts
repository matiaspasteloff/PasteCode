import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAiIpcHandlers } from './ai.js';

/**
 * Todo lo que este archivo cablea, moqueado.
 *
 * Lo que se verifica acá es **el cableado**: que los siete canales existan,
 * que `ai:chat` no espere a la respuesta, y que la clave entre por un canal y
 * no salga por ninguno. La lógica del agente y la del cliente tienen sus
 * propios archivos.
 */
const electron = vi.hoisted(
  (): {
    handlers: Map<string, (event: unknown, raw: unknown) => unknown>;
    hasWindow: boolean;
  } => ({ handlers: new Map(), hasWindow: true })
);

const ai = vi.hoisted(
  (): {
    calls: string[];
    models: { id: string; name: string; contextLength: number }[];
    key: string | null;
    canPersist: boolean;
    /** Se resuelve a mano: es lo que permite ver que `ai:chat` no la espera. */
    finishAgent: () => void;
  } => ({
    calls: [],
    models: [{ id: 'x:free', name: 'X', contextLength: 8192 }],
    key: null,
    canPersist: true,
    finishAgent: () => undefined,
  })
);

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  BrowserWindow: { getAllWindows: () => (electron.hasWindow ? [{}] : []) },
}));

vi.mock('../ai/agent.js', () => ({
  runAgent: () =>
    new Promise<void>((resolve) => {
      ai.calls.push('runAgent');
      ai.finishAgent = resolve;
    }),
  cancelAgent: (requestId: string) => ai.calls.push(`cancelAgent:${requestId}`),
  cancelAllAgents: () => ai.calls.push('cancelAllAgents'),
  resolveToolCall: () => ai.calls.push('resolveToolCall'),
}));

vi.mock('../ai/credentials.js', () => ({
  canPersistApiKey: () => ai.canPersist,
  clearApiKey: () => {
    ai.key = null;
    return Promise.resolve();
  },
  loadApiKey: () => Promise.resolve(ai.key),
  saveApiKey: (apiKey: string) => {
    ai.key = apiKey;
    return Promise.resolve();
  },
}));

vi.mock('../ai/openrouter.js', () => ({
  forgetCatalog: () => ai.calls.push('forgetCatalog'),
  listFreeModels: () => Promise.resolve(ai.models),
}));

/** Invoca un canal a través del listener que quedó registrado. */
function invoke(channel: string, payload: unknown = {}): Promise<unknown> {
  return Promise.resolve(electron.handlers.get(channel)?.({}, payload));
}

/** El payload mínimo de `ai:chat`. */
const CHAT = {
  requestId: 'req-1',
  model: 'x:free',
  messages: [{ role: 'user', content: 'hola' }],
};

beforeEach(() => {
  electron.handlers.clear();
  electron.hasWindow = true;
  ai.calls = [];
  ai.key = null;
  ai.canPersist = true;

  registerAiIpcHandlers();
});

describe('registerAiIpcHandlers', () => {
  it('registra los siete canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'ai:listModels',
      'ai:chat',
      'ai:cancel',
      'ai:toolResult',
      'ai:setApiKey',
      'ai:getKeyStatus',
      'ai:clearApiKey',
    ]);
  });
});

describe('ai:chat', () => {
  it('arranca la respuesta y devuelve sin esperarla', async () => {
    // **Deliberadamente sin await**: la respuesta viaja por `ai:delta` y
    // `ai:done`. Devolver recién al terminar dejaría el invoke colgado quince
    // segundos y al renderer sin nada que pintar.
    await expect(invoke('ai:chat', CHAT)).resolves.toEqual({ ok: true, value: {} });

    expect(ai.calls).toContain('runAgent');

    ai.finishAgent();
  });

  it('no arranca nada sin ventana a la que mandarle los eventos', async () => {
    // Toda la respuesta viaja por eventos: arrancar sería quemar cuota contra
    // nadie.
    electron.hasWindow = false;

    await expect(invoke('ai:chat', CHAT)).resolves.toEqual({ ok: true, value: {} });
    expect(ai.calls).toEqual([]);
  });

  it('rechaza un payload que no cumple el schema', async () => {
    await expect(invoke('ai:chat', { requestId: '' })).resolves.toMatchObject({ ok: false });
    expect(ai.calls).toEqual([]);
  });
});

describe('ai:cancel y ai:toolResult', () => {
  it('delegan en el agente', async () => {
    await invoke('ai:cancel', { requestId: 'req-1' });
    await invoke('ai:toolResult', {
      requestId: 'req-1',
      toolCallId: 'call_1',
      outcome: 'applied',
      detail: '',
    });

    expect(ai.calls).toEqual(['cancelAgent:req-1', 'resolveToolCall']);
  });
});

describe('ai:listModels', () => {
  it('devuelve los modelos ya filtrados por el cliente', async () => {
    await expect(invoke('ai:listModels')).resolves.toEqual({
      ok: true,
      value: { models: ai.models },
    });
  });
});

describe('los canales de la clave', () => {
  it('la guarda y olvida el catálogo, que es por cuenta', async () => {
    await invoke('ai:setApiKey', { apiKey: 'sk-or-test' });

    expect(ai.key).toBe('sk-or-test');
    expect(ai.calls).toContain('forgetCatalog');
  });

  it('nunca devuelve la clave: sólo si hay y si se puede guardar', async () => {
    // RF-1003. Una clave que llega al renderer es una clave que puede leer
    // cualquier XSS o cualquier extensión.
    ai.key = 'sk-or-test';

    await expect(invoke('ai:getKeyStatus')).resolves.toEqual({
      ok: true,
      value: { hasKey: true, canPersist: true },
    });
  });

  it('informa que no se puede persistir en un sistema sin cifrado', async () => {
    ai.canPersist = false;

    await expect(invoke('ai:getKeyStatus')).resolves.toEqual({
      ok: true,
      value: { hasKey: false, canPersist: false },
    });
  });

  it('la borra y olvida el catálogo', async () => {
    ai.key = 'sk-or-test';

    await invoke('ai:clearApiKey');

    expect(ai.key).toBeNull();
    expect(ai.calls).toContain('forgetCatalog');
  });
});
