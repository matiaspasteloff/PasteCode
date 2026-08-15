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
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-save-'));
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

/** Abre el workspace y el archivo, y deja el cursor dentro del editor. */
async function openFile(): Promise<Page> {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'saludo.ts' }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible();
  await window.locator('.monaco-editor .view-lines').click();

  return window;
}

test('editar marca el archivo como sucio y Ctrl+S lo limpia', async () => {
  const window = await openFile();

  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  await window.keyboard.press('Control+End');
  await window.keyboard.type('\nconst extra = 1;');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeVisible();

  await window.keyboard.press('Control+S');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  expect(await readFile(target, 'utf8')).toContain('const extra = 1;');
});

test('el guardado es atómico y no deja temporales', async () => {
  const window = await openFile();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('x');
  await window.keyboard.press('Control+S');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  // El temporal del guardado atómico se llama `.<nombre>.<uuid>.tmp` y vive en
  // el mismo directorio. Si quedara, aparecería en el árbol.
  const { readdir } = await import('node:fs/promises');
  const left = (await readdir(workspace)).filter((name) => name.endsWith('.tmp'));
  expect(left).toEqual([]);
});

test('ofrece sobrescribir o descartar cuando el archivo cambió en el disco', async () => {
  const window = await openFile();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('\nconst mio = 1;');

  // Otro proceso toca el archivo entre la lectura y el guardado.
  await writeFile(target, 'const deOtro = 2;\n', 'utf8');

  await window.keyboard.press('Control+S');

  const dialog = window.getByTestId('conflict-dialog');
  await expect(dialog).toBeVisible();
  // Nada se recarga en silencio: las dos salidas destruyen trabajo de alguien.
  await expect(dialog.getByRole('button', { name: 'Sobrescribir el archivo' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Descartar mis cambios' })).toBeVisible();
});

test('sobrescribir aplica los cambios locales sobre el archivo de disco', async () => {
  const window = await openFile();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('\nconst mio = 1;');
  await writeFile(target, 'const deOtro = 2;\n', 'utf8');
  await window.keyboard.press('Control+S');

  await window.getByRole('button', { name: 'Sobrescribir el archivo' }).click();

  await expect(window.getByTestId('conflict-dialog')).toBeHidden();
  expect(await readFile(target, 'utf8')).toContain('const mio = 1;');
});

test('descartar recupera lo que hay en el disco', async () => {
  const window = await openFile();
  await window.keyboard.press('Control+End');
  await window.keyboard.type('\nconst mio = 1;');
  await writeFile(target, 'const deOtro = 2;\n', 'utf8');
  await window.keyboard.press('Control+S');

  await window.getByRole('button', { name: 'Descartar mis cambios' }).click();

  await expect(window.getByTestId('conflict-dialog')).toBeHidden();
  await expect(window.locator('.monaco-editor')).toContainText('const deOtro = 2;');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();
});
