import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
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

/**
 * Texto que se escribe para ensuciar el buffer.
 *
 * Sin espacios ni operadores a propósito: al tipear `const x = 1;` el popup de
 * sugerencias por palabra se abre y acepta completados solo, y lo que termina
 * en el buffer no es lo que se escribió. Los tests quedaban no deterministas
 * por eso, no por el editor.
 */
const MARKER = 'ZZMARCAZZ';

/** Escribe el marcador al final del archivo activo y cierra el popup. */
async function typeMarker(window: Page): Promise<void> {
  await window.keyboard.press('Control+End');
  await window.keyboard.type(MARKER);
  // Escape cierra el popup de sugerencias: con el popup abierto, Monaco
  // enruta las teclas siguientes al popup y no al editor.
  await window.keyboard.press('Escape');
}

/**
 * Simula que otro proceso modificó el archivo.
 *
 * El `utimes` no es adorno: el conflicto se detecta comparando `mtimeMs`, y si
 * la escritura externa cae en el mismo milisegundo que la lectura del editor
 * los dos tiempos coinciden y no hay conflicto que detectar. Forzar un mtime
 * claramente distinto hace que el test verifique la lógica de conflicto en vez
 * de la resolución del reloj del filesystem.
 */
async function changeOnDisk(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8');
  const future = new Date(Date.now() + 2000);
  await utimes(path, future, future);
}

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

  await typeMarker(window);
  await expect(window.getByTestId('tab-dirty-indicator')).toBeVisible();

  await window.keyboard.press('Control+S');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  expect(await readFile(target, 'utf8')).toContain(MARKER);
});

test('el guardado es atómico y no deja temporales', async () => {
  const window = await openFile();
  await typeMarker(window);
  await window.keyboard.press('Control+S');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  // El temporal del guardado atómico se llama `.<nombre>.<uuid>.tmp` y vive en
  // el mismo directorio. Si quedara, aparecería en el árbol.
  const { readdir } = await import('node:fs/promises');
  const left = (await readdir(workspace)).filter((name) => name.endsWith('.tmp'));
  expect(left).toEqual([]);
});

test('sobrescribir aplica los cambios locales sobre el archivo de disco', async () => {
  const window = await openFile();
  await typeMarker(window);
  await changeOnDisk(target, 'const deOtro = 2;\n');
  await window.keyboard.press('Control+S');

  // Nada se recarga en silencio: las dos salidas destruyen trabajo de alguien,
  // así que las dos se ofrecen y decide la persona.
  const dialog = window.getByTestId('conflict-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Descartar mis cambios' })).toBeVisible();

  await window.getByRole('button', { name: 'Sobrescribir el archivo' }).click();

  // Se espera a que el punto de "sin guardar" desaparezca y no sólo a que el
  // diálogo se cierre: el diálogo se cierra apenas arranca el guardado, así
  // que leer el disco en ese momento es una carrera contra la escritura.
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();
  expect(await readFile(target, 'utf8')).toContain(MARKER);
});

test('descartar recupera lo que hay en el disco', async () => {
  const window = await openFile();
  await typeMarker(window);
  await changeOnDisk(target, 'const deOtro = 2;\n');
  await window.keyboard.press('Control+S');

  await window.getByRole('button', { name: 'Descartar mis cambios' }).click();

  await expect(window.getByTestId('conflict-dialog')).toBeHidden();
  await expect(window.locator('.monaco-editor')).toContainText('const deOtro = 2;');
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();
});
