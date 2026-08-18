import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTempDirectory } from '../test-support/temp-directory.js';

import { registerWorkspaceIpcHandlers } from './workspace.js';

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

const electron = vi.hoisted(() => {
  const emptyDialogResult: { canceled: boolean; filePaths: string[] } = {
    canceled: true,
    filePaths: [],
  };

  return {
    handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
    isPackaged: false,
    dialogResult: emptyDialogResult,
    dialogCalls: 0,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  app: {
    get isPackaged(): boolean {
      return electron.isPackaged;
    },
  },
  BrowserWindow: {
    getFocusedWindow: (): undefined => undefined,
    getAllWindows: (): [] => [],
  },
  dialog: {
    showOpenDialog: (): Promise<DialogResult> => {
      electron.dialogCalls += 1;
      return Promise.resolve(electron.dialogResult);
    },
  },
}));

/**
 * Los efectos que `workspace:open` dispara además de abrir la carpeta.
 *
 * **Van mockeados y no es opcional.** Sin esto, cada `open` de este archivo
 * levanta de verdad el servicio de settings —que además lee el
 * `~/.pastecode/settings.json` de la máquina, no el del sandbox—, un watcher de
 * chokidar sobre el directorio temporal y otro sobre su `.git`, y ninguno se
 * cierra nunca: quedan handles vivos sobre una carpeta que el `afterEach`
 * borra un instante después. En Windows ese handle recibe `EPERM` cuando el
 * directorio desaparece, y el error asincrónico aterriza sobre cualquier test
 * que estuviera corriendo en ese momento. Es cómo este archivo producía un
 * fallo suelto e irreproducible en una corrida completa.
 *
 * Además cambia lo que el archivo prueba, para bien: qué colaboradores dispara
 * el handler pasa a ser una aserción en vez de un efecto de fondo.
 */
const services = vi.hoisted(() => ({
  stopLspServers: vi.fn(() => Promise.resolve()),
  setSettingsWorkspace: vi.fn(() => Promise.resolve()),
  startWatchingWorkspace: vi.fn(),
  startWatchingGit: vi.fn(),
}));

vi.mock('../lsp/registry.js', () => ({ stopLspServers: services.stopLspServers }));
vi.mock('../services/settings.js', () => ({
  setSettingsWorkspace: services.setSettingsWorkspace,
}));
vi.mock('./watcher.js', () => ({ startWatchingWorkspace: services.startWatchingWorkspace }));
vi.mock('./git.js', () => ({ startWatchingGit: services.startWatchingGit }));

let sandbox: string;
let project: string;

/** Invoca un canal a través del listener que quedó registrado. */
function invoke(channel: string): Promise<unknown> {
  return Promise.resolve(electron.handlers.get(channel)?.({}, {}));
}

beforeEach(async () => {
  // `makeTempDirectory` y no `mkdtemp` a secas: la raíz que devuelve
  // `openWorkspaceAt` viene de `realpath.native`, así que la esperada tiene que
  // estar resuelta con el mismo criterio o en un Windows con `TEMP` en formato
  // 8.3 —el runner del CI— la comparación no da nunca.
  sandbox = await makeTempDirectory('pastecode-wsipc-');
  project = join(sandbox, 'PasteCode');
  await mkdir(project);

  electron.handlers.clear();
  electron.isPackaged = false;
  electron.dialogResult = { canceled: true, filePaths: [] };
  electron.dialogCalls = 0;
  delete process.env.PASTECODE_E2E_WORKSPACE;
  vi.clearAllMocks();

  registerWorkspaceIpcHandlers();
});

afterEach(async () => {
  delete process.env.PASTECODE_E2E_WORKSPACE;
  await rm(sandbox, { recursive: true, force: true });
});

describe('registerWorkspaceIpcHandlers', () => {
  it('registra los dos canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual(['workspace:open', 'workspace:getRoot']);
  });
});

describe('workspace:open', () => {
  it('abre la carpeta que elige la persona en el diálogo', async () => {
    electron.dialogResult = { canceled: false, filePaths: [project] };

    await expect(invoke('workspace:open')).resolves.toEqual({
      ok: true,
      value: { root: project, name: 'PasteCode' },
    });
  });

  it('devuelve null cuando se cancela el diálogo, sin tratarlo como error', async () => {
    electron.dialogResult = { canceled: true, filePaths: [] };

    await expect(invoke('workspace:open')).resolves.toEqual({ ok: true, value: null });
  });

  it('usa la variable de E2E en lugar de abrir el diálogo', async () => {
    process.env.PASTECODE_E2E_WORKSPACE = project;

    const result = await invoke('workspace:open');

    expect(result).toEqual({ ok: true, value: { root: project, name: 'PasteCode' } });
    expect(electron.dialogCalls).toBe(0);
  });

  it('ignora la variable de E2E en un build empaquetado', async () => {
    // **Es el test que importa de este archivo.** El guard de `isPackaged` es
    // lo único que impide que alguien con acceso a las variables de entorno de
    // la máquina le fuerce un workspace al .exe distribuido. Si esto empieza a
    // fallar, la puerta de test quedó abierta en producción.
    electron.isPackaged = true;
    process.env.PASTECODE_E2E_WORKSPACE = project;

    const result = await invoke('workspace:open');

    expect(result).toEqual({ ok: true, value: null });
    expect(electron.dialogCalls).toBe(1);
  });

  it('ignora la variable de E2E si está vacía', async () => {
    process.env.PASTECODE_E2E_WORKSPACE = '';

    await invoke('workspace:open');

    expect(electron.dialogCalls).toBe(1);
  });

  it('repunta los servicios que dependen de la raíz', async () => {
    process.env.PASTECODE_E2E_WORKSPACE = project;

    await invoke('workspace:open');

    // Los servidores de lenguaje **antes** de cambiar de raíz: uno que quedó
    // vivo sigue contestando sobre el workspace anterior.
    expect(services.stopLspServers).toHaveBeenCalledOnce();
    expect(services.stopLspServers.mock.invocationCallOrder[0]).toBeLessThan(
      services.setSettingsWorkspace.mock.invocationCallOrder[0] ?? Infinity
    );
    expect(services.setSettingsWorkspace).toHaveBeenCalledWith(project);
    expect(services.startWatchingWorkspace).toHaveBeenCalledWith(project);
    expect(services.startWatchingGit).toHaveBeenCalledWith(project);
  });

  it('no toca ningún servicio cuando se cancela el diálogo', async () => {
    electron.dialogResult = { canceled: true, filePaths: [] };

    await invoke('workspace:open');

    // Cancelar deja todo como estaba: apagar los LSP o soltar los watchers del
    // workspace abierto sería perder trabajo por no haber elegido carpeta.
    expect(services.stopLspServers).not.toHaveBeenCalled();
    expect(services.setSettingsWorkspace).not.toHaveBeenCalled();
    expect(services.startWatchingWorkspace).not.toHaveBeenCalled();
    expect(services.startWatchingGit).not.toHaveBeenCalled();
  });
});

describe('workspace:getRoot', () => {
  // El caso "todavía no hay ninguno abierto" no se testea acá: el workspace es
  // estado de módulo y no se reinicia entre tests de un mismo archivo, así que
  // depender de eso sería un test sensible al orden. Vive donde sí es el
  // primero, en services/workspace.test.ts. Es la consecuencia de ADR-0004
  // sobre los stores sin provider, del lado del main.
  it('devuelve el workspace abierto', async () => {
    process.env.PASTECODE_E2E_WORKSPACE = project;
    await invoke('workspace:open');

    await expect(invoke('workspace:getRoot')).resolves.toEqual({
      ok: true,
      value: { root: project, name: 'PasteCode' },
    });
  });
});
