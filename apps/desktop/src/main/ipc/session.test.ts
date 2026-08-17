import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ElectronState {
  handlers: Map<string, (event: unknown, raw: unknown) => unknown>;
}

interface ServiceState {
  workspace: { root: string; name: string } | null;
  saved: unknown;
  plan: Record<string, unknown>;
  scheduled: unknown[];
  flushed: unknown[];
  disposeCalls: number;
}

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted((): ElectronState => ({ handlers: new Map() }));

const service = vi.hoisted((): ServiceState => ({
  workspace: null,
  saved: null,
  plan: { openTabs: ['a.ts'], activeTabIndex: 0, expandedFolders: ['src'] },
  scheduled: [],
  flushed: [],
  disposeCalls: 0,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
}));

vi.mock('../services/session.js', () => ({
  loadSession: (): Promise<unknown> => Promise.resolve(service.saved),
  planSessionRestore: (): Promise<unknown> => Promise.resolve(service.plan),
  scheduleSessionSave: (state: unknown): void => {
    service.scheduled.push(state);
  },
  flushSessionSave: (state: unknown): Promise<void> => {
    service.flushed.push(state);
    return Promise.resolve();
  },
  disposeSession: (): void => {
    service.disposeCalls += 1;
  },
}));

vi.mock('../services/workspace.js', () => ({
  getWorkspace: (): unknown => service.workspace,
  requireWorkspaceRoot: (): string => {
    if (service.workspace === null) throw new Error('sin workspace');
    return service.workspace.root;
  },
}));

/** Invoca un canal a través del listener que quedó registrado. */
function invoke(channel: string, payload: unknown = {}): Promise<unknown> {
  return Promise.resolve(electron.handlers.get(channel)?.({}, payload));
}

/** Una pestaña con la forma que exige el contrato. */
function tab(uri: string): Record<string, unknown> {
  return {
    uri,
    cursorPosition: { line: 1, column: 1 },
    scrollTopLine: 1,
    isDirty: false,
    isPinned: false,
  };
}

/**
 * El módulo bajo test, reimportado en cada caso.
 *
 * `session.ts` guarda lo último que reportó el renderer en una variable de
 * módulo, así que sin resetear el registro de módulos un test que guarda deja
 * esa variable cargada para el siguiente y `flushSession` deja de poder
 * observar el caso "nunca se reportó nada".
 */
let session: typeof import('./session.js');

beforeEach(async () => {
  vi.resetModules();

  electron.handlers.clear();
  service.workspace = { root: '/proyecto', name: 'proyecto' };
  service.saved = null;
  service.plan = { openTabs: ['a.ts'], activeTabIndex: 0, expandedFolders: ['src'] };
  service.scheduled = [];
  service.flushed = [];
  service.disposeCalls = 0;

  session = await import('./session.js');
  session.registerSessionIpcHandlers();
});

describe('registerSessionIpcHandlers', () => {
  it('registra los dos canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual(['session:load', 'session:save']);
  });
});

describe('session:load', () => {
  it('devuelve null sin workspace, que es el estado de una app recién instalada', async () => {
    service.workspace = null;

    await expect(invoke('session:load')).resolves.toEqual({
      ok: true,
      value: { state: null },
    });
  });

  it('devuelve null cuando el workspace todavía no tiene sesión guardada', async () => {
    service.saved = null;

    await expect(invoke('session:load')).resolves.toEqual({
      ok: true,
      value: { state: null },
    });
  });

  it('devuelve el plan filtrado, omitiendo las claves que el plan no trae', async () => {
    // RF-707: el descarte de pestañas no abribles pasa del lado que puede
    // mirar el disco, y las claves ausentes se omiten en vez de viajar como
    // `undefined` porque el schema es estricto.
    service.saved = { openTabs: ['a.ts', 'borrado.ts'] };

    await expect(invoke('session:load')).resolves.toEqual({
      ok: true,
      value: {
        state: { openTabs: ['a.ts'], activeTabIndex: 0, expandedFolders: ['src'] },
      },
    });
  });

  it('incluye grupos, layout y grupo activo cuando el plan los trae', async () => {
    service.saved = { openTabs: ['a.ts'] };
    service.plan = {
      openTabs: ['a.ts'],
      activeTabIndex: 0,
      expandedFolders: [],
      groups: [{ tabs: ['a.ts'], activeTabIndex: 0 }],
      layout: 'vertical',
      activeGroupId: 1,
    };

    await expect(invoke('session:load')).resolves.toMatchObject({
      ok: true,
      value: {
        state: {
          groups: [{ tabs: ['a.ts'], activeTabIndex: 0 }],
          layout: 'vertical',
          activeGroupId: 1,
        },
      },
    });
  });
});

describe('session:save', () => {
  it('agenda el guardado con la raíz del workspace agregada', async () => {
    const state = {
      openTabs: [tab('file:///proyecto/a.ts')],
      activeTabIndex: 0,
      expandedFolders: [],
    };

    await expect(invoke('session:save', state)).resolves.toEqual({ ok: true, value: {} });

    expect(service.scheduled).toEqual([{ ...state, rootPath: '/proyecto' }]);
  });
});

describe('flushSession', () => {
  it('descarta la sesión cuando el renderer nunca reportó nada', async () => {
    await session.flushSession();

    expect(service.disposeCalls).toBe(1);
    expect(service.flushed).toEqual([]);
  });

  it('escribe lo último que reportó el renderer, salteando el debounce', async () => {
    // Sin esto, los 2 segundos de debounce se comen lo último que la persona
    // hizo antes de cerrar, que es justo lo que más se nota.
    const state = {
      openTabs: [tab('file:///proyecto/b.ts')],
      activeTabIndex: 0,
      expandedFolders: [],
    };

    await invoke('session:save', state);
    await session.flushSession();

    expect(service.flushed).toEqual([{ ...state, rootPath: '/proyecto' }]);
  });
});
