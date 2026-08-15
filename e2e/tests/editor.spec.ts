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
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-editor-'));
  await writeFile(join(workspace, 'saludo.ts'), 'const saludo = "hola";\n', 'utf8');
  await writeFile(join(workspace, 'notas.md'), '# Notas\n', 'utf8');

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
});

/** Abre el workspace y espera a que Monaco esté montado. */
async function openWorkspaceAndFile(fileName: string): Promise<Page> {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: fileName }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible();

  return window;
}

test('abre un archivo del árbol y muestra su contenido', async () => {
  const window = await openWorkspaceAndFile('saludo.ts');

  await expect(window.locator('.monaco-editor')).toContainText('const saludo = "hola";');
});

test('resalta la sintaxis con la gramática del lenguaje', async () => {
  // RF-101. El resaltado sale de las gramáticas Monarch incluidas en Monaco:
  // que `const` quede tokenizado como palabra clave es la prueba de que la
  // gramática de TypeScript se registró y se aplicó.
  const window = await openWorkspaceAndFile('saludo.ts');

  await expect(
    window.locator('.monaco-editor .mtk1, .monaco-editor .mtk5').first()
  ).toBeVisible();
  const keyword = window.locator('.monaco-editor span', { hasText: /^const$/ }).first();
  await expect(keyword).toBeVisible();
});

test('el web worker de Monaco arranca bajo el esquema propio', async () => {
  // **Es el test que justifica ADR-0012.** Bajo `file://` el origen es opaco y
  // Chromium se niega a construir el worker; si alguien vuelve a `loadFile`,
  // esto falla y explica por qué.
  const window = await openWorkspaceAndFile('saludo.ts');

  expect(await window.evaluate(() => globalThis.location.origin)).toBe('pastecode://app');

  // Las sugerencias por palabra las calcula el web worker, no el hilo de la
  // UI. Es la forma de comprobar que el worker arrancó *y* responde: Monaco lo
  // crea de forma perezosa, así que abrir el archivo solo no alcanza para
  // saberlo. Si el worker estuviera bloqueado, el popup nunca aparecería.
  await window.locator('.monaco-editor .view-lines').click();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('sal');
  await window.keyboard.press('Control+Space');

  await expect(window.locator('.suggest-widget')).toBeVisible();
  await expect(window.locator('.suggest-widget')).toContainText('saludo');
});

test('no reporta errores de consola al abrir un archivo', async () => {
  const window = await app.firstWindow();
  const errors: string[] = [];
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'notas.md' }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible();

  expect(errors).toEqual([]);
});
