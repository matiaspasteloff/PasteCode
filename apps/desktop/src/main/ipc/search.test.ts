import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerSearchIpcHandlers } from './search.js';

interface EmittedEvent {
  channel: string;
  payload: unknown;
}

interface ElectronState {
  handlers: Map<string, (event: unknown, raw: unknown) => unknown>;
  windows: unknown[];
  sent: EmittedEvent[];
}

interface SearchCallbacks {
  onResult: (matches: unknown) => void;
  onDone: (result: { truncated: boolean; error: unknown }) => void;
}

interface ServiceState {
  disposers: Map<string, () => unknown>;
  started: { options: unknown; root: string }[];
  callbacks: SearchCallbacks | undefined;
  cancelCalls: number;
  exclude: string[];
}

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted((): ElectronState => ({
  handlers: new Map(),
  windows: [],
  sent: [],
}));

const service = vi.hoisted((): ServiceState => ({
  disposers: new Map(),
  started: [],
  callbacks: undefined,
  cancelCalls: 0,
  exclude: ['**/node_modules/**'],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  BrowserWindow: {
    getAllWindows: (): unknown[] => electron.windows,
  },
}));

vi.mock('../services/search.js', () => ({
  startSearch: (options: unknown, root: string, callbacks: SearchCallbacks): void => {
    service.started.push({ options, root });
    service.callbacks = callbacks;
  },
  cancelSearch: (): void => {
    service.cancelCalls += 1;
  },
}));

vi.mock('../services/settings.js', () => ({
  currentSettings: (): unknown => ({ files: { exclude: service.exclude } }),
}));

vi.mock('../services/shutdown.js', () => ({
  registerDisposer: (name: string, dispose: () => unknown): void => {
    service.disposers.set(name, dispose);
  },
}));

vi.mock('../services/workspace.js', () => ({
  requireWorkspaceRoot: (): string => '/proyecto',
}));

vi.mock('./emitter.js', () => ({
  emit: (_window: unknown, channel: string, payload: unknown): void => {
    electron.sent.push({ channel, payload });
  },
}));

/** Invoca un canal a través del listener que quedó registrado. */
function invoke(channel: string, payload: unknown = {}): Promise<unknown> {
  return Promise.resolve(electron.handlers.get(channel)?.({}, payload));
}

/** Un payload de `search:start` con la forma que exige el contrato. */
function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    searchId: 'busqueda-1',
    query: 'registerHandler',
    isRegex: false,
    isCaseSensitive: false,
    matchWholeWord: false,
    includeGlobs: [],
    ...overrides,
  };
}

beforeEach(() => {
  electron.handlers.clear();
  electron.windows = [{ id: 1 }];
  electron.sent = [];
  service.disposers.clear();
  service.started = [];
  service.callbacks = undefined;
  service.cancelCalls = 0;
  service.exclude = ['**/node_modules/**'];

  registerSearchIpcHandlers();
});

describe('registerSearchIpcHandlers', () => {
  it('registra los dos canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual(['search:start', 'search:cancel']);
  });

  it('registra el disposer que corta ripgrep al cerrar', () => {
    // RNF-10: cerrar la app en medio de una búsqueda sobre un repo grande
    // dejaba el `rg` vivo y adoptado por el sistema.
    expect([...service.disposers.keys()]).toEqual(['search']);

    service.disposers.get('search')?.();

    expect(service.cancelCalls).toBe(1);
  });
});

describe('search:start', () => {
  it('arranca la búsqueda contra la raíz del workspace', async () => {
    await expect(invoke('search:start', request())).resolves.toEqual({
      ok: true,
      value: {},
    });

    expect(service.started).toHaveLength(1);
    expect(service.started[0]?.root).toBe('/proyecto');
  });

  it('usa el exclude de files como filtro de la búsqueda', () => {
    // RF-005: la misma clave que filtra el árbol filtra la búsqueda, por eso
    // el schema no tiene una sección `search.*`.
    service.exclude = ['**/dist/**'];

    void invoke('search:start', request());

    expect(service.started[0]?.options).toMatchObject({ excludeGlobs: ['**/dist/**'] });
  });

  it('emite los resultados a las ventanas con el id de la búsqueda', async () => {
    await invoke('search:start', request({ searchId: 'abc' }));

    service.callbacks?.onResult([{ path: '/proyecto/a.ts', line: 1 }]);

    expect(electron.sent).toEqual([
      {
        channel: 'search:result',
        payload: { searchId: 'abc', matches: [{ path: '/proyecto/a.ts', line: 1 }] },
      },
    ]);
  });

  it('emite el final sin error como null', async () => {
    await invoke('search:start', request({ searchId: 'abc' }));

    service.callbacks?.onDone({ truncated: false, error: null });

    expect(electron.sent).toEqual([
      { channel: 'search:done', payload: { searchId: 'abc', truncated: false, error: null } },
    ]);
  });

  it('serializa el error del final en código y mensaje', async () => {
    await invoke('search:start', request({ searchId: 'abc' }));

    service.callbacks?.onDone({
      truncated: true,
      error: { code: 'RIPGREP_FAILED', userMessage: 'No se pudo buscar', stack: 'ignorado' },
    });

    // Viaja sólo lo que el contrato declara: un stack crudo no cruza el IPC.
    expect(electron.sent).toEqual([
      {
        channel: 'search:done',
        payload: {
          searchId: 'abc',
          truncated: true,
          error: { code: 'RIPGREP_FAILED', userMessage: 'No se pudo buscar' },
        },
      },
    ]);
  });

  it('rechaza una consulta vacía', async () => {
    const result = await invoke('search:start', request({ query: '' }));

    expect(result).toMatchObject({ ok: false });
    expect(service.started).toEqual([]);
  });
});

describe('search:cancel', () => {
  it('cancela la búsqueda en curso', async () => {
    await expect(invoke('search:cancel')).resolves.toEqual({ ok: true, value: {} });

    expect(service.cancelCalls).toBe(1);
  });
});
