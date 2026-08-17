import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerSettingsIpcHandlers, startSettings } from './settings.js';

interface EmittedEvent {
  channel: string;
  payload: unknown;
}

interface ElectronState {
  handlers: Map<string, (event: unknown, raw: unknown) => unknown>;
  windows: unknown[];
  sent: EmittedEvent[];
}

/** Lo que `initializeSettings` recibe: el callback de cambio y, si la hay, la ruta. */
interface InitializeOptions {
  onChange: (settings: unknown) => void;
  userPath?: string;
}

interface ServiceState {
  settings: Record<string, unknown>;
  error: { code: string; userMessage: string } | undefined;
  initialized: InitializeOptions[];
  updated: { scope: unknown; settings: unknown }[];
}

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted((): ElectronState => ({
  handlers: new Map(),
  windows: [],
  sent: [],
}));

const service = vi.hoisted((): ServiceState => ({
  settings: { fontSize: 14 },
  error: undefined,
  initialized: [],
  updated: [],
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
  currentSettings: (): unknown => service.settings,
  settingsError: (): unknown => service.error,
  initializeSettings: (options: InitializeOptions): Promise<void> => {
    service.initialized.push(options);
    return Promise.resolve();
  },
  updateSettings: (scope: unknown, settings: Record<string, unknown>): Promise<unknown> => {
    service.updated.push({ scope, settings });
    service.settings = { ...service.settings, ...settings };
    return Promise.resolve(service.settings);
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

beforeEach(() => {
  electron.handlers.clear();
  electron.windows = [];
  electron.sent = [];
  service.settings = { fontSize: 14 };
  service.error = undefined;
  service.initialized = [];
  service.updated = [];

  registerSettingsIpcHandlers();
});

describe('registerSettingsIpcHandlers', () => {
  it('registra los dos canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual(['settings:get', 'settings:update']);
  });
});

describe('settings:get', () => {
  it('devuelve las settings vigentes sin error cuando el archivo está sano', async () => {
    await expect(invoke('settings:get')).resolves.toEqual({
      ok: true,
      value: { settings: { fontSize: 14 }, error: null },
    });
  });

  it('manda el error al lado de las settings, no en lugar de ellas', async () => {
    // RNF-25: un settings.json roto deja la app andando con los últimos
    // valores buenos y con algo para mostrar.
    service.error = { code: 'SETTINGS_PARSE', userMessage: 'El archivo está roto' };

    await expect(invoke('settings:get')).resolves.toEqual({
      ok: true,
      value: {
        settings: { fontSize: 14 },
        error: { code: 'SETTINGS_PARSE', userMessage: 'El archivo está roto' },
      },
    });
  });
});

describe('settings:update', () => {
  it('delega en el servicio y devuelve las settings resueltas', async () => {
    const result = await invoke('settings:update', {
      scope: 'user',
      settings: { editor: { fontSize: 18 } },
    });

    expect(service.updated).toEqual([
      { scope: 'user', settings: { editor: { fontSize: 18 } } },
    ]);
    expect(result).toEqual({
      ok: true,
      value: { settings: { fontSize: 14, editor: { fontSize: 18 } }, error: null },
    });
  });

  it('rechaza un scope que no está en el contrato', async () => {
    const result = await invoke('settings:update', {
      scope: 'global',
      settings: { editor: { fontSize: 18 } },
    });

    expect(result).toMatchObject({ ok: false });
    expect(service.updated).toEqual([]);
  });
});

describe('startSettings', () => {
  it('inicializa el servicio con el broadcast como callback de cambio', async () => {
    await startSettings();

    expect(service.initialized).toHaveLength(1);
    expect(typeof service.initialized[0]?.onChange).toBe('function');
  });

  it('usa el directorio que le pasan para ubicar el settings.json', async () => {
    await startSettings('/tmp/datos');

    expect(service.initialized[0]?.userPath).toContain('settings.json');
  });

  it('no arma una ruta cuando no le pasan directorio', async () => {
    // La clave se omite en vez de viajar en `undefined`: con
    // `exactOptionalPropertyTypes` no son lo mismo.
    await startSettings();

    expect(service.initialized[0]?.userPath).toBeUndefined();
  });

  it('emite las settings a cada ventana abierta cuando el servicio avisa un cambio', async () => {
    electron.windows = [{ id: 1 }, { id: 2 }];
    await startSettings();

    // El callback que recibió el servicio es el broadcast: dispararlo es lo
    // que ejercita la recarga en caliente de RF-704.
    service.initialized[0]?.onChange({ fontSize: 20 });

    expect(electron.sent).toEqual([
      { channel: 'settings:changed', payload: { settings: { fontSize: 20 }, error: null } },
      { channel: 'settings:changed', payload: { settings: { fontSize: 20 }, error: null } },
    ]);
  });
});
