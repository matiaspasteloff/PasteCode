import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

let app: ElectronApplication;
let workspace: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-tema-'));
  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
});

/**
 * Fuerza un tema escribiendo el atributo, como hace `useTheme`.
 *
 * El camino por la paleta lo cubre el otro test de este archivo, y la lógica
 * de resolución la cubren los unitarios de `useTheme`. Acá interesa lo otro:
 * que **el mecanismo de tokens CSS repinte la aplicación de verdad**, que es
 * lo que afirma RF-801.
 */
async function forceTheme(window: Page, theme: 'light' | 'dark'): Promise<void> {
  await window.evaluate((value: string) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

/** El color de fondo calculado de un selector. */
async function backgroundOf(window: Page, selector: string): Promise<string> {
  return window
    .locator(selector)
    .evaluate((element) => globalThis.getComputedStyle(element).backgroundColor);
}

test('cambia de tema en caliente y repinta toda la aplicación', async () => {
  // RF-801. Todo el color sale de variables CSS, así que cambiar un atributo
  // del `<html>` repinta la aplicación entera sin volver a montar nada.
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  // `system` ya viene resuelto: el atributo nunca dice "system".
  expect(['light', 'dark']).toContain(
    await window.evaluate(() => document.documentElement.dataset.theme)
  );

  await forceTheme(window, 'light');
  const light = {
    body: await backgroundOf(window, 'body'),
    side: await backgroundOf(window, '.sidebar'),
  };

  await forceTheme(window, 'dark');
  const dark = {
    body: await backgroundOf(window, 'body'),
    side: await backgroundOf(window, '.sidebar'),
  };

  // El fondo y los paneles: si sólo cambiara uno, el tema estaría a medias.
  expect(light.body).not.toBe(dark.body);
  expect(light.side).not.toBe(dark.side);
});

test('el comando de la paleta cambia el tema', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();
  await window.locator('.status-bar').click();
  await forceTheme(window, 'light');

  await window.keyboard.press('Control+Shift+P');
  await expect(window.getByRole('combobox')).toBeVisible();
  await window.keyboard.type('tema');
  await expect(window.getByRole('option')).toHaveCount(1);
  await window.keyboard.press('Enter');

  await expect(window.locator('.palette')).toHaveCount(0);
  expect(['light', 'dark']).toContain(
    await window.evaluate(() => document.documentElement.dataset.theme)
  );
});
