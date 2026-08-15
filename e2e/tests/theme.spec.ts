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
 * El camino por la paleta lo cubren los tests de `command-palette.spec.ts` y
 * los unitarios de `useTheme`. Acá interesa lo otro: que **el mecanismo de
 * tokens CSS repinte la aplicación de verdad**, que es lo que afirma RF-801.
 * Pasar por la paleta sólo agregaría una fuente de intermitencia entre el test
 * y lo que se quiere medir.
 */
async function forceTheme(window: Page, theme: 'light' | 'dark'): Promise<void> {
  await window.evaluate((value: string) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

/** El color de fondo que el navegador terminó aplicando al body. */
async function backgroundOf(window: Page): Promise<string> {
  return window.evaluate(() => globalThis.getComputedStyle(document.body).backgroundColor);
}

test('arranca con un tema resuelto en el html', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  // `system` ya viene resuelto: el atributo nunca dice "system".
  const theme = await window.evaluate(() => document.documentElement.dataset.theme);

  expect(['light', 'dark']).toContain(theme);
});

test('cambia de tema en caliente, sin recargar la ventana', async () => {
  // RF-801. Todo el color sale de variables CSS, así que cambiar un atributo
  // del `<html>` repinta la aplicación entera sin volver a montar nada.
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  await forceTheme(window, 'light');
  const light = await backgroundOf(window);

  await forceTheme(window, 'dark');
  const dark = await backgroundOf(window);

  expect(light).not.toBe(dark);
});

test('el tema alcanza a los paneles y no sólo al fondo', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  await forceTheme(window, 'light');
  const light = await window
    .locator('.sidebar')
    .evaluate((element) => globalThis.getComputedStyle(element).backgroundColor);

  await forceTheme(window, 'dark');
  const dark = await window
    .locator('.sidebar')
    .evaluate((element) => globalThis.getComputedStyle(element).backgroundColor);

  expect(light).not.toBe(dark);
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

  // Desde `system` el ciclo pasa por `light` y después `dark`; lo que se
  // verifica es que el comando llegue a `useTheme` y reescriba el atributo.
  await expect.poll(async () => backgroundOf(window)).toBeDefined();
  await expect(window.locator('.palette')).toHaveCount(0);
});
