import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

let app: ElectronApplication;
let workspace: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-archivos-'));
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

/** Abre el workspace y espera a que el árbol esté pintado. */
async function openWorkspace(): Promise<
  Awaited<ReturnType<ElectronApplication['firstWindow']>>
> {
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await expect(window.getByRole('treeitem', { name: 'uno.ts' })).toBeVisible();

  return window;
}

/**
 * RF-003, crear.
 *
 * Va de punta a punta a propósito: el campo del árbol, el canal de IPC, el
 * `open` con modo exclusivo en el main y el archivo apareciendo en el disco de
 * verdad. Los tests unitarios cubren cada tramo por separado; lo que sólo se
 * puede verificar acá es que estén conectados.
 */
test('RF-003: crear un archivo desde el árbol lo escribe en el disco', async () => {
  const window = await openWorkspace();

  await window.getByRole('treeitem', { name: 'uno.ts' }).press('Escape');
  await window.keyboard.press('Control+Shift+P');
  await window.getByPlaceholder('Escribí para buscar un comando…').fill('Archivo nuevo');
  await window.keyboard.press('Enter');

  await window.getByTestId('file-tree-input').fill('dos.ts');
  await window.keyboard.press('Enter');

  await expect(window.getByRole('treeitem', { name: 'dos.ts' })).toBeVisible();
  expect(await readdir(workspace)).toContain('dos.ts');
});

/** RF-003, renombrar: `F2` sobre la fila enfocada. */
test('RF-003: renombrar con F2 cambia el nombre en el disco', async () => {
  const window = await openWorkspace();

  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).press('F2');

  await window.getByTestId('file-tree-input').fill('renombrado.ts');
  await window.keyboard.press('Enter');

  await expect(window.getByRole('treeitem', { name: 'renombrado.ts' })).toBeVisible();

  const entries = await readdir(workspace);

  expect(entries).toContain('renombrado.ts');
  // Renombrar mueve, no copia: el nombre viejo tiene que haber desaparecido.
  expect(entries).not.toContain('uno.ts');
});

/**
 * RF-003, el criterio textual: renombrar a un nombre existente **muestra error
 * sin perder datos**.
 *
 * `fs.rename` sobrescribe el destino en silencio en las tres plataformas, así
 * que sin el chequeo del main este test encontraría `ocupado.ts` con el
 * contenido de `uno.ts`.
 */
test('RF-003: renombrar sobre un nombre existente no pisa nada', async () => {
  await writeFile(join(workspace, 'ocupado.ts'), 'no me pises\n', 'utf8');

  const window = await openWorkspace();

  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).press('F2');
  await window.getByTestId('file-tree-input').fill('ocupado.ts');
  await window.keyboard.press('Enter');

  // Los dos archivos siguen enteros, cada uno con lo suyo.
  const entries = await readdir(workspace);

  expect(entries).toContain('uno.ts');
  expect(entries).toContain('ocupado.ts');
});

/**
 * RF-003, eliminar: **a la papelera del sistema operativo**, no `unlink`.
 *
 * Que el archivo termine en la papelera de Windows no se puede afirmar desde
 * acá sin hurgar en la papelera del usuario que corre la suite, que es
 * exactamente lo que no hay que hacer en un test. Lo que sí se verifica es todo
 * lo demás: que haya que confirmar, que el archivo desaparezca del workspace y
 * que el árbol se entere.
 */
test('RF-003: eliminar pide confirmación y saca el archivo del workspace', async () => {
  const window = await openWorkspace();

  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).press('Delete');

  // Sin confirmar todavía no pasó nada: `Delete` está pegada a las flechas.
  await expect(window.getByTestId('delete-dialog')).toBeVisible();
  expect(await readdir(workspace)).toContain('uno.ts');

  await window.getByTestId('delete-confirm').click();

  await expect(window.getByRole('treeitem', { name: 'uno.ts' })).toBeHidden();
  expect(await readdir(workspace)).not.toContain('uno.ts');
});

/** RF-003: cancelar el diálogo no elimina nada. */
test('RF-003: cancelar el diálogo deja el archivo donde estaba', async () => {
  const window = await openWorkspace();

  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).press('Delete');
  await expect(window.getByTestId('delete-dialog')).toBeVisible();

  await window.getByRole('button', { name: 'Cancelar' }).click();

  await expect(window.getByRole('treeitem', { name: 'uno.ts' })).toBeVisible();
  expect(await readdir(workspace)).toContain('uno.ts');
});
