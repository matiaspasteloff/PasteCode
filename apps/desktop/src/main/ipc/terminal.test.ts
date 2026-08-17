import { beforeEach, describe, expect, it, vi } from 'vitest';

interface EmittedEvent {
  channel: string;
  payload: unknown;
}

interface ElectronState {
  handlers: Map<string, (event: unknown, raw: unknown) => unknown>;
  windows: unknown[];
  sent: EmittedEvent[];
}

interface ServiceState {
  disposers: Map<string, (graceMs?: number) => unknown>;
  supervisorsCreated: unknown[];
  created: unknown[];
  writes: { sessionId: string; data: string }[];
  resizes: unknown[];
  disposed: string[];
  disposeAllCalls: number;
  sessions: unknown[];
}

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted((): ElectronState => ({
  handlers: new Map(),
  windows: [],
  sent: [],
}));

const service = vi.hoisted((): ServiceState => ({
  disposers: new Map(),
  supervisorsCreated: [],
  created: [],
  writes: [],
  resizes: [],
  disposed: [],
  disposeAllCalls: 0,
  sessions: [],
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

vi.mock('../services/settings.js', () => ({
  currentSettings: (): unknown => ({ terminal: { shell: null } }),
}));

vi.mock('../services/shell.js', () => ({
  resolveShell: (): unknown => ({ command: '/bin/bash', args: [] }),
}));

vi.mock('../services/shutdown.js', () => ({
  registerDisposer: (name: string, dispose: (graceMs?: number) => unknown): void => {
    service.disposers.set(name, dispose);
  },
}));

vi.mock('../services/workspace.js', () => ({
  requireWorkspaceRoot: (): string => '/proyecto',
}));

vi.mock('../supervisors/pty.js', () => ({
  createPtySupervisor: (options: unknown): unknown => {
    service.supervisorsCreated.push(options);

    return {
      create: (payload: unknown): unknown => {
        service.created.push(payload);
        return { sessionId: 'sesion-1' };
      },
      write: (sessionId: string, data: string): void => {
        service.writes.push({ sessionId, data });
      },
      resize: (sessionId: string, size: unknown): void => {
        service.resizes.push({ sessionId, size });
      },
      dispose: (sessionId: string): void => {
        service.disposed.push(sessionId);
      },
      disposeAll: (): Promise<void> => {
        service.disposeAllCalls += 1;
        return Promise.resolve();
      },
      list: (): unknown[] => service.sessions,
    };
  },
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

/**
 * El módulo bajo test, reimportado en cada caso: el supervisor vive en una
 * variable de módulo y se crea perezosamente con la primera terminal.
 */
let terminal: typeof import('./terminal.js');

beforeEach(async () => {
  vi.resetModules();

  electron.handlers.clear();
  electron.windows = [];
  electron.sent = [];
  service.disposers.clear();
  service.supervisorsCreated = [];
  service.created = [];
  service.writes = [];
  service.resizes = [];
  service.disposed = [];
  service.disposeAllCalls = 0;
  service.sessions = [];

  terminal = await import('./terminal.js');
  terminal.registerTerminalIpcHandlers();
});

describe('registerTerminalIpcHandlers', () => {
  it('registra los cinco canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'terminal:create',
      'terminal:write',
      'terminal:resize',
      'terminal:dispose',
      'terminal:list',
    ]);
  });

  it('registra el disposer que mata las terminales al cerrar', () => {
    // RF-305 y RNF-10: cerrar la app con un `npm run dev` corriendo no puede
    // dejar el proceso hijo vivo y adoptado por el sistema.
    expect([...service.disposers.keys()]).toEqual(['terminal']);
  });
});

describe('terminal:list', () => {
  it('devuelve la lista vacía antes de que exista el supervisor', async () => {
    // El supervisor es perezoso porque necesita la raíz del workspace, y al
    // registrar los handlers todavía no hay carpeta abierta.
    await expect(invoke('terminal:list')).resolves.toEqual({
      ok: true,
      value: { sessions: [] },
    });

    expect(service.supervisorsCreated).toEqual([]);
  });
});

describe('terminal:create', () => {
  it('crea el supervisor en la primera terminal y devuelve la sesión', async () => {
    await expect(invoke('terminal:create', { cols: 80, rows: 24 })).resolves.toEqual({
      ok: true,
      value: { sessionId: 'sesion-1' },
    });

    expect(service.supervisorsCreated).toHaveLength(1);
    expect(service.created).toEqual([{ cols: 80, rows: 24 }]);
  });

  it('reusa el mismo supervisor en la segunda terminal', async () => {
    await invoke('terminal:create', { cols: 80, rows: 24 });
    await invoke('terminal:create', { cols: 80, rows: 24 });

    expect(service.supervisorsCreated).toHaveLength(1);
    expect(service.created).toHaveLength(2);
  });
});

describe('terminal:write', () => {
  it('manda la entrada al PTY de la sesión', async () => {
    await invoke('terminal:create', { cols: 80, rows: 24 });

    await expect(
      invoke('terminal:write', { sessionId: 'sesion-1', data: 'ls\r' })
    ).resolves.toEqual({ ok: true, value: {} });

    expect(service.writes).toEqual([{ sessionId: 'sesion-1', data: 'ls\r' }]);
  });
});

describe('terminal:resize', () => {
  it('propaga el nuevo tamaño', async () => {
    await invoke('terminal:create', { cols: 80, rows: 24 });

    await expect(
      invoke('terminal:resize', { sessionId: 'sesion-1', cols: 120, rows: 40 })
    ).resolves.toEqual({ ok: true, value: {} });

    expect(service.resizes).toHaveLength(1);
  });
});

describe('terminal:dispose', () => {
  it('cierra la sesión que le indican', async () => {
    await invoke('terminal:create', { cols: 80, rows: 24 });

    await expect(invoke('terminal:dispose', { sessionId: 'sesion-1' })).resolves.toEqual({
      ok: true,
      value: {},
    });

    expect(service.disposed).toEqual(['sesion-1']);
  });
});

describe('el disposer del dominio', () => {
  it('no falla si nunca se abrió una terminal', async () => {
    await service.disposers.get('terminal')?.();

    expect(service.disposeAllCalls).toBe(0);
  });

  it('mata todas las sesiones cuando el supervisor existe', async () => {
    await invoke('terminal:create', { cols: 80, rows: 24 });

    await service.disposers.get('terminal')?.();

    expect(service.disposeAllCalls).toBe(1);
  });
});
