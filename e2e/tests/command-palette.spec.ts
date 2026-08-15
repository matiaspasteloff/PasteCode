import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
let target: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-palette-'));
  target = join(workspace, 'saludo.ts');
  await writeFile(target, 'const saludo = "hola";\n', 'utf8');

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
 * Espera a que la ventana esté pintada y con el foco adentro del documento.
 *
 * Recién lanzada, la app todavía no tiene el foco en ningún elemento, y
 * `keyboard.press` no le llega a ningún listener. Un click en la barra de
 * estado alcanza y no dispara ninguna acción.
 */
async function readyWindow(): Promise<Page> {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();
  await window.locator('.status-bar').click();

  return window;
}

test('Ctrl+Shift+P abre la paleta con los comandos registrados', async () => {
  const window = await readyWindow();

  await window.keyboard.press('Control+Shift+P');

  await expect(window.getByRole('combobox', { name: 'Paleta de comandos' })).toBeVisible();
  await expect(window.getByRole('option')).not.toHaveCount(0);
});

test('filtra los comandos mientras se tipea', async () => {
  const window = await readyWindow();
  await window.keyboard.press('Control+Shift+P');

  await window.keyboard.type('guardar');

  await expect(window.getByRole('option')).toHaveCount(1);
  await expect(window.getByRole('option')).toHaveText('Guardar el archivo');
});

test('ejecuta el comando de guardar desde la paleta', async () => {
  // Es la prueba de que el refactor del paso 17 sirvió para algo: la misma
  // acción que hace Ctrl+S se puede disparar desde la paleta porque las dos
  // pasan por el mismo comando registrado.
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'saludo.ts' }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible();

  await window.locator('.monaco-editor .view-lines').click();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('ZZMARCAZZ');
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeVisible();

  await window.keyboard.press('Control+Shift+P');
  await window.keyboard.type('guardar');
  await window.keyboard.press('Enter');

  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();
  expect(await readFile(target, 'utf8')).toContain('ZZMARCAZZ');
});

test('cierra con Escape sin ejecutar nada', async () => {
  const window = await readyWindow();
  await window.keyboard.press('Control+Shift+P');
  await expect(window.getByRole('combobox')).toBeVisible();

  await window.keyboard.press('Escape');

  await expect(window.getByRole('combobox')).toBeHidden();
});

test('abre una carpeta desde la paleta', async () => {
  const window = await readyWindow();

  await window.keyboard.press('Control+Shift+P');
  await window.keyboard.type('abrir carpeta');
  await window.keyboard.press('Enter');

  // El comando dispara el mismo diálogo que el botón, y el flag de E2E lo
  // saltea igual.
  await expect(window.getByTestId('workspace-name')).toHaveText(
    workspace.split(/[\\/]/).at(-1) ?? ''
  );
});
