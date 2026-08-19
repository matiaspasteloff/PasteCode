import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Settings } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTempDirectory } from '../test-support/temp-directory.js';

import {
  currentSettings,
  disposeSettings,
  initializeSettings,
  setSettingsWorkspace,
  settingsError,
  updateSettings,
} from './settings.js';

/**
 * Techo de tiempo de este archivo, **aplicado de verdad**.
 *
 * `vi.setConfig` y no un tercer argumento en cada `it()`: la constante estaba
 * declarada desde el principio y no se le pasaba a ninguno, así que vitest
 * mataba los tests a los 5 s por omisión y el techo era decorativo. Configurarlo
 * una vez por archivo cierra la clase entera de error — un test que se agregue
 * mañana lo hereda sin que nadie se acuerde.
 */
const TIMEOUT_MS = 10_000;

vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

let home: string;
let workspace: string;
let userFile: string;
let changes: Settings[];

/** Espera a que una condición se cumpla, sondeando. */
async function waitFor(condition: () => boolean, describeFailure: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Se agotó la espera: ${describeFailure}`);

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Escribe una capa de settings, creando el directorio si hace falta. */
async function writeLayer(path: string, contents: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

beforeEach(async () => {
  home = await makeTempDirectory('pastecode-settings-home-');
  workspace = await makeTempDirectory('pastecode-settings-ws-');
  userFile = join(home, '.pastecode', 'settings.json');
  changes = [];

  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  disposeSettings();
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

/** Arranca el servicio contra los directorios temporales del test. */
async function start(options: { withWorkspace?: boolean } = {}): Promise<void> {
  await initializeSettings({
    userPath: userFile,
    onChange: (settings) => changes.push(settings),
  });

  await setSettingsWorkspace(options.withWorkspace === true ? workspace : null);
}

describe('el servicio de settings', () => {
  it('arranca con los defaults cuando no hay ningún archivo', async () => {
    await start();

    expect(currentSettings().editor.fontSize).toBe(14);
    expect(settingsError()).toBeUndefined();
  });

  it('aplica el archivo del usuario', async () => {
    await writeLayer(userFile, JSON.stringify({ editor: { fontSize: 20 } }));

    await start();

    expect(currentSettings().editor.fontSize).toBe(20);
  });

  it('le da precedencia al archivo del workspace', async () => {
    await writeLayer(userFile, JSON.stringify({ editor: { fontSize: 20, tabSize: 8 } }));
    await writeLayer(
      join(workspace, '.pastecode', 'settings.json'),
      JSON.stringify({ editor: { fontSize: 24 } })
    );

    await start({ withWorkspace: true });

    // RF-705: gana el workspace, pero sólo en la clave que menciona.
    expect(currentSettings().editor.fontSize).toBe(24);
    expect(currentSettings().editor.tabSize).toBe(8);
  });

  it('ignora el shell que pida un workspace', async () => {
    await writeLayer(
      join(workspace, '.pastecode', 'settings.json'),
      JSON.stringify({ terminal: { shell: 'C:\\malo\\payload.exe' } })
    );

    await start({ withWorkspace: true });

    // Un .pastecode/settings.json viaja adentro de cualquier repo clonado.
    expect(currentSettings().terminal.shell).toBeNull();
  });

  it('suelta la capa del workspace al cerrarlo', async () => {
    await writeLayer(
      join(workspace, '.pastecode', 'settings.json'),
      JSON.stringify({ editor: { fontSize: 24 } })
    );
    await start({ withWorkspace: true });
    expect(currentSettings().editor.fontSize).toBe(24);

    await setSettingsWorkspace(null);

    expect(currentSettings().editor.fontSize).toBe(14);
  });

  it('conserva los últimos valores buenos cuando el archivo queda inválido', async () => {
    await writeLayer(userFile, JSON.stringify({ editor: { fontSize: 20 } }));
    await start();

    await writeFile(userFile, '{ "editor": { "fontSize": 20, }', 'utf8');

    await waitFor(() => settingsError() !== undefined, 'el watcher nunca vio el archivo roto');

    // RNF-25: la app sigue andando, y con los valores de antes.
    expect(currentSettings().editor.fontSize).toBe(20);
    expect(settingsError()?.code).toBe('INVALID_SETTINGS_FILE');
    expect(settingsError()?.userMessage).toContain(userFile);
  });

  it('rechaza una clave que no existe igual que un JSON roto', async () => {
    await start();

    await writeLayer(userFile, JSON.stringify({ editor: { fontsize: 20 } }));

    await waitFor(
      () => settingsError() !== undefined,
      'el watcher nunca vio la clave inválida'
    );
    expect(currentSettings().editor.fontSize).toBe(14);
  });

  it('se recupera solo cuando el archivo se arregla', async () => {
    await start();
    await writeLayer(userFile, '{ roto');
    await waitFor(() => settingsError() !== undefined, 'el watcher nunca vio el archivo roto');

    await writeFile(userFile, JSON.stringify({ editor: { fontSize: 22 } }), 'utf8');

    await waitFor(
      () => currentSettings().editor.fontSize === 22,
      'el archivo arreglado nunca se releyó'
    );
    expect(settingsError()).toBeUndefined();
  });

  it('avisa del cambio cuando el archivo cambia desde afuera', async () => {
    await start();

    await writeLayer(userFile, JSON.stringify({ editor: { fontSize: 18 } }));

    // RF-704: es la recarga en caliente. Sin este evento, el renderer no se
    // entera de nada de lo que pase en el disco.
    await waitFor(() => changes.length > 0, 'nunca llegó la notificación de cambio');
    expect(changes.at(-1)?.editor.fontSize).toBe(18);
  });

  it('colapsa la ráfaga de eventos de un guardado en una sola notificación', async () => {
    await start();

    // Un guardado atómico produce varios eventos de `fs.watch`. Sin debounce,
    // el renderer repinta una vez por cada uno.
    await writeLayer(userFile, JSON.stringify({ editor: { fontSize: 15 } }));
    await writeFile(userFile, JSON.stringify({ editor: { fontSize: 16 } }), 'utf8');
    await writeFile(userFile, JSON.stringify({ editor: { fontSize: 17 } }), 'utf8');

    await waitFor(() => changes.length > 0, 'nunca llegó la notificación de cambio');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(changes).toHaveLength(1);
    expect(changes.at(-1)?.editor.fontSize).toBe(17);
  });
});

describe('updateSettings', () => {
  it('escribe la capa del usuario y resuelve de nuevo', async () => {
    await start();

    const resolved = await updateSettings('user', { editor: { fontSize: 19 } });

    expect(resolved.editor.fontSize).toBe(19);
    expect(currentSettings().editor.fontSize).toBe(19);
  });

  it('conserva lo que el archivo ya tenía', async () => {
    await writeLayer(
      userFile,
      JSON.stringify({ editor: { tabSize: 8 }, window: { zoomLevel: 2 } })
    );
    await start();

    await updateSettings('user', { editor: { fontSize: 19 } });

    // El renderer manda sólo lo que cambió: no puede borrar el resto.
    expect(currentSettings().editor.tabSize).toBe(8);
    expect(currentSettings().window.zoomLevel).toBe(2);
  });

  it('sella el archivo con la versión del formato', async () => {
    await start();

    await updateSettings('user', { editor: { fontSize: 19 } });

    // git.md declara al formato como contrato público: sin versión no hay
    // forma de migrar un archivo viejo el día que cambie.
    const written: unknown = JSON.parse(await readFile(userFile, 'utf8'));

    expect(written).toMatchObject({ version: 1 });
  });

  it('rechaza escribir en el workspace cuando no hay ninguno abierto', async () => {
    await start();

    await expect(
      updateSettings('workspace', { editor: { fontSize: 19 } })
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_OPEN' });
  });
});
