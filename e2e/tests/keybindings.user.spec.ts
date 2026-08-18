import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT, makeTempDirectory } from './support/desktop.js';

let app: ElectronApplication;
let workspace: string;
let home: string;
let keybindingsFile: string;

test.beforeEach(async () => {
  workspace = await makeTempDirectory('pastecode-keys-ws-');
  // Por `makeTempDirectory` y no por `mkdtemp`: la recarga en caliente de
  // RF-702 cuelga de un `fs.watch` sobre este directorio, y sobre una ruta
  // 8.3 ese watcher no avisa nunca. Es lo que hacía fallar este spec en el
  // CI de Windows y no localmente.
  home = await makeTempDirectory('pastecode-keys-home-');
  keybindingsFile = join(home, 'keybindings.json');

  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');
  await mkdir(home, { recursive: true });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

/** Lanza la app con el `~/.pastecode` apuntando al temporal del test. */
async function launch(): Promise<Awaited<ReturnType<ElectronApplication['firstWindow']>>> {
  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: {
      ...process.env,
      PASTECODE_E2E_WORKSPACE: workspace,
      PASTECODE_E2E_HOME: home,
    },
  });

  return app.firstWindow();
}

/**
 * RF-702: un atajo del usuario pisa al de fábrica.
 *
 * `Ctrl+K` no hace nada de fábrica. Con el archivo del usuario pasa a abrir la
 * paleta, que es un efecto imposible de confundir con otra cosa.
 */
test('RF-702: el keybindings.json del usuario agrega un atajo', async () => {
  await writeFile(
    keybindingsFile,
    JSON.stringify([{ key: 'Ctrl+K', command: 'palette.open' }]),
    'utf8'
  );

  const window = await launch();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  await window.keyboard.press('Control+k');

  // La tecla se escribió `Ctrl+K` y el resolver compara contra `ctrl+k`: si la
  // normalización no corriera, esto no pasaría nada y no habría error que ver.
  await expect(window.getByPlaceholder('Escribí para buscar un comando…')).toBeVisible();
});

/**
 * RF-702, la otra mitad: los conflictos **se reportan**.
 *
 * Detectarlos y no decirlo deja a alguien apretando una tecla que hace otra
 * cosa sin ninguna pista de por qué.
 */
test('RF-702: dos atajos con la misma tecla se reportan en pantalla', async () => {
  await writeFile(
    keybindingsFile,
    JSON.stringify([
      { key: 'ctrl+k', command: 'palette.open' },
      { key: 'ctrl+k', command: 'file.save' },
    ]),
    'utf8'
  );

  const window = await launch();

  const indicator = window.getByTestId('status-keybindings');

  await expect(indicator).toBeVisible();
  await expect(indicator).toContainText('1');
});

/** Sin conflictos el indicador no está: un contador en cero es ruido. */
test('RF-702: sin conflictos no se muestra ningún aviso', async () => {
  await writeFile(
    keybindingsFile,
    JSON.stringify([{ key: 'ctrl+k', command: 'palette.open' }]),
    'utf8'
  );

  const window = await launch();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  await expect(window.getByTestId('status-keybindings')).toBeHidden();
});

/**
 * RF-702: la recarga en caliente.
 *
 * Es el criterio del plan: editar el archivo con la app abierta cambia el atajo
 * sin reiniciar nada.
 */
test('RF-702: editar el archivo con la app abierta recarga los atajos', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await expect(window.getByTestId('status-keybindings')).toBeHidden();

  await writeFile(
    keybindingsFile,
    JSON.stringify([
      { key: 'ctrl+j', command: 'palette.open' },
      { key: 'ctrl+j', command: 'file.save' },
    ]),
    'utf8'
  );

  // Sin reiniciar: el main observa el archivo y emite `keybindings:changed`.
  await expect(window.getByTestId('status-keybindings')).toBeVisible();
});

/** RNF-25: un archivo roto no puede dejar la app sin teclado. */
test('RF-702: un keybindings.json roto deja la app andando con los de fábrica', async () => {
  await writeFile(keybindingsFile, '[{ "key": "ctrl+k", }', 'utf8');

  const window = await launch();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  // Se avisa del archivo roto...
  await expect(window.getByTestId('status-keybindings')).toBeVisible();

  // ...y el atajo de fábrica sigue funcionando.
  await window.keyboard.press('Control+Shift+P');
  await expect(window.getByPlaceholder('Escribí para buscar un comando…')).toBeVisible();
});
