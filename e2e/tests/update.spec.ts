import { rm } from 'node:fs/promises';

import { _electron as electron, expect, test } from '@playwright/test';

import { DESKTOP_ROOT, makeTempDirectory } from './support/desktop.js';

let home: string;

test.beforeEach(async () => {
  home = await makeTempDirectory('pastecode-update-');
});

test.afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

test('sin empaquetar, buscar actualizaciones deja un aviso unsupported accionable', async () => {
  // El build de `out/` no está empaquetado: el main no tiene instalador que
  // actualizar ni release contra el cual comparar, así que el estado es
  // `unsupported` desde el arranque y ningún camino carga electron-updater ni
  // sale a la red. Lo que se verifica es que pedir el chequeo no falle en
  // silencio: el aviso aparece y ofrece ir a la página de las versiones.
  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_HOME: home },
  });
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  // Nada que decir hasta que alguien pregunta.
  await expect(window.getByTestId('status-update')).toHaveCount(0);

  await window.locator('.status-bar').click();
  await window.keyboard.press('Control+Shift+P');
  await window.keyboard.type('Buscar actualizaciones');
  await expect(window.getByRole('option').first()).toHaveText('Buscar actualizaciones');
  await window.keyboard.press('Enter');

  const notice = window.getByTestId('status-update');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-state', 'unsupported');
  // Accionable: es un botón, no un texto. No se lo clickea porque abriría el
  // navegador del sistema en la máquina que corre el test.
  await expect(notice).toHaveRole('button');

  await app.close();
});
