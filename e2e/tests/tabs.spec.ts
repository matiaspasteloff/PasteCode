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
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-tabs-'));
  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');
  await writeFile(join(workspace, 'dos.ts'), 'const dos = 2;\n', 'utf8');
  await writeFile(join(workspace, 'tres.ts'), 'const tres = 3;\n', 'utf8');

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
  await window.locator('.monaco-editor .view-lines').click();
  await window.keyboard.press('Control+End');
  await window.keyboard.type(MARKER);
  // Escape cierra el popup de sugerencias: con el popup abierto, Monaco
  // enruta las teclas siguientes al popup y no al editor.
  await window.keyboard.press('Escape');
}

/** Abre el workspace y los archivos indicados, en orden. */
async function openFiles(...names: string[]): Promise<Page> {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  for (const name of names) {
    await window.getByRole('treeitem', { name }).click();
    await expect(window.locator('.monaco-editor')).toContainText(name.replace('.ts', ''));
  }

  return window;
}

test('una pestaña por archivo: reabrir no duplica, y tras cerrar relee del disco', async () => {
  const window = await openFiles('uno.ts', 'dos.ts', 'tres.ts');

  await expect(window.getByRole('tab')).toHaveCount(3);
  await expect(window.getByRole('tab', { selected: true })).toHaveAttribute(
    'data-testid',
    'tab-tres.ts'
  );

  // Reabrir desde el árbol activa la pestaña que ya existe en vez de sumar
  // otra: dos pestañas del mismo archivo se pisarían el contenido.
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();

  await expect(window.getByRole('tab')).toHaveCount(3);
  await expect(window.locator('.monaco-editor')).toContainText('const uno = 1;');

  // **La otra mitad, que es el test de la fuga.** Cerrar tiene que desechar el
  // modelo, y la forma de comprobarlo desde afuera es cambiar el archivo en el
  // disco mientras está cerrado: si el modelo hubiera sobrevivido, Monaco
  // devolvería ese, con el contenido viejo, y nadie se enteraría hasta perder
  // trabajo. Iba en un test aparte hasta que la sesión llenó el presupuesto de
  // 30 E2E de testing.md, que manda fusionar antes que subir el número; son
  // las dos caras de "una pestaña por archivo", así que van juntas.
  await window.getByRole('button', { name: 'Cerrar uno.ts' }).click();
  await writeFile(join(workspace, 'uno.ts'), 'const cambiado = 99;\n', 'utf8');
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();

  await expect(window.locator('.monaco-editor')).toContainText('const cambiado = 99;');
  await expect(window.locator('.monaco-editor')).not.toContainText('const uno = 1;');
});

test('conserva lo editado al cambiar de pestaña y ensucia sólo la editada', async () => {
  const window = await openFiles('uno.ts', 'dos.ts');

  // Se edita `dos.ts`, se va a `uno.ts` y se vuelve.
  await typeMarker(window);
  await expect(
    window.getByTestId('tab-dos.ts').getByTestId('tab-dirty-indicator')
  ).toBeVisible();
  await expect(
    window.getByTestId('tab-uno.ts').getByTestId('tab-dirty-indicator')
  ).toBeHidden();

  await window.getByTestId('tab-uno.ts').click();
  await expect(window.locator('.monaco-editor')).toContainText('const uno = 1;');
  await window.getByTestId('tab-dos.ts').click();

  // El modelo sobrevive al cambio de pestaña, así que la edición sigue ahí.
  await expect(window.locator('.monaco-editor')).toContainText(MARKER);
});

test('conserva el historial de deshacer por archivo', async () => {
  // RF-106. El undo vive en el modelo, no en el editor, así que alternar de
  // pestaña no lo pierde: es la razón de tener un editor y N modelos.
  const window = await openFiles('uno.ts', 'dos.ts');
  await typeMarker(window);

  await window.getByTestId('tab-uno.ts').click();
  await window.getByTestId('tab-dos.ts').click();
  await window.locator('.monaco-editor .view-lines').click();
  await window.keyboard.press('Control+Z');

  await expect(window.locator('.monaco-editor')).not.toContainText(MARKER);
  await expect(window.locator('.monaco-editor')).toContainText('const dos = 2;');
});

test('al cerrar queda la de la derecha, y el estado vacío si era la última', async () => {
  const window = await openFiles('uno.ts', 'dos.ts', 'tres.ts');
  await window.getByTestId('tab-dos.ts').click();

  await window.getByRole('button', { name: 'Cerrar dos.ts' }).click();

  await expect(window.getByRole('tab')).toHaveCount(2);
  await expect(window.getByRole('tab', { selected: true })).toHaveAttribute(
    'data-testid',
    'tab-tres.ts'
  );

  await window.getByRole('button', { name: 'Cerrar tres.ts' }).click();
  await window.getByRole('button', { name: 'Cerrar uno.ts' }).click();

  await expect(window.getByRole('tab')).toHaveCount(0);
  await expect(window.getByText('Abrí una carpeta para empezar a editar.')).toBeVisible();
});
