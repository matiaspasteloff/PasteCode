import { mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBackupDirectory } from '../services/backups.js';

import {
  handleDiscardBackups,
  handlePendingBackups,
  handleWriteBackup,
  registerBackupsIpcHandlers,
} from './backups.js';

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
}));

let workspace: string;
let home: string;

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'pastecode-bkipc-')));
  home = await realpath(await mkdtemp(join(tmpdir(), 'pastecode-bkhome-')));

  useBackupDirectory(join(home, 'backups'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('handleWriteBackup', () => {
  it('respalda el contenido y devuelve cuándo lo hizo', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'const x = 1;', 'utf8');

    const result = await handleWriteBackup({ path, content: 'sin guardar' }, workspace);

    expect(result.savedAt).toBeGreaterThan(0);
    expect(await readdir(join(home, 'backups'))).toHaveLength(1);
  });

  it('rechaza respaldar algo de fuera del workspace', async () => {
    // Sin esto, el renderer elegiría el nombre del respaldo y su contenido.
    const attempt = handleWriteBackup(
      { path: join(workspace, '..', 'ajeno.ts'), content: 'x' },
      workspace
    );

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });
});

describe('handlePendingBackups', () => {
  it('no devuelve nada cuando no hay respaldos', async () => {
    await expect(handlePendingBackups()).resolves.toEqual({ backups: [] });
  });

  it('devuelve lo respaldado de un archivo que ya no está', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'const x = 1;', 'utf8');
    await handleWriteBackup({ path, content: 'lo único que queda' }, workspace);
    await rm(path);

    const { backups } = await handlePendingBackups();

    expect(backups).toHaveLength(1);
    expect(backups[0]?.content).toBe('lo único que queda');
  });
});

describe('handleDiscardBackups', () => {
  it('borra todos cuando no se le da ruta', async () => {
    const path = join(workspace, 'a.ts');
    await writeFile(path, 'x', 'utf8');
    await handleWriteBackup({ path, content: 'y' }, workspace);
    await rm(path);

    await handleDiscardBackups({});

    await expect(handlePendingBackups()).resolves.toEqual({ backups: [] });
  });
});

describe('registerBackupsIpcHandlers', () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerBackupsIpcHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registra los tres canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'backups:write',
      'backups:pending',
      'backups:discard',
    ]);
  });

  it('backups:write se niega a operar sin un workspace abierto', async () => {
    // Sin raíz no hay contra qué validar la ruta, y la única respuesta correcta
    // es negarse.
    const result = await electron.handlers.get('backups:write')?.(
      {},
      { path: 'C:\\Windows\\notepad.exe', content: 'x' }
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'WORKSPACE_NOT_OPEN' } });
  });

  it('backups:pending sí funciona sin workspace abierto', async () => {
    // Se piden al arrancar, antes de saber qué carpeta se va a abrir. Los
    // respaldos son del usuario, no de un workspace.
    const result = await electron.handlers.get('backups:pending')?.({}, {});

    expect(result).toMatchObject({ ok: true });
  });
});
