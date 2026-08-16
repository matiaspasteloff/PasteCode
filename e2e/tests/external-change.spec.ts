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
let target: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-external-'));
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
 * Sin espacios ni operadores, por lo mismo que en `save.spec.ts`: al tipear
 * algo con forma de código, el popup de sugerencias se abre y acepta
 * completados solo, y lo que termina en el buffer no es lo que se escribió.
 */
const MARKER = 'ZZMARCAZZ';

/** Abre el workspace y el archivo, y deja el cursor dentro del editor. */
async function openTarget(): Promise<Page> {
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'saludo.ts' }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible();
  await window.locator('.monaco-editor .view-lines').click();

  return window;
}

/** Escribe el marcador al final del archivo activo y cierra el popup. */
async function typeMarker(window: Page): Promise<void> {
  await window.keyboard.press('Control+End');
  await window.keyboard.type(MARKER);
  // Escape cierra el popup de sugerencias: con el popup abierto, Monaco
  // enruta las teclas siguientes al popup y no al editor.
  await window.keyboard.press('Escape');
}

test('RF-004: recarga en silencio un archivo limpio que cambió afuera', async () => {
  const window = await openTarget();

  await expect(window.locator('.monaco-editor')).toContainText('hola');

  // El cambio externo: lo que haría `git checkout` o un formateador.
  await writeFile(target, 'const saludo = "cambiado desde afuera";\n', 'utf8');

  // Sin diálogo y sin marcar la pestaña como sucia: no hay nada que perder, así
  // que preguntar sería molestar.
  await expect(window.locator('.monaco-editor')).toContainText('cambiado desde afuera', {
    timeout: 20_000,
  });
  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();
});

test('avisa en vez de pisar cuando la pestaña tiene cambios sin guardar', async () => {
  const window = await openTarget();

  await typeMarker(window);
  await expect(window.getByTestId('tab-dirty-indicator')).toBeVisible();

  await writeFile(target, 'const saludo = "cambiado desde afuera";\n', 'utf8');

  // Recargar encima de lo que alguien escribió es destruir trabajo: la decisión
  // es de la persona, con el mismo diálogo que ya existía para el conflicto al
  // guardar.
  await expect(window.getByTestId('conflict-dialog')).toBeVisible({ timeout: 20_000 });
});

test('guardar no dispara una recarga de lo que acabamos de escribir', async () => {
  // Es la supresión de escrituras propias. Sin ella, `fs:writeFile` dispara el
  // watcher y el renderer relee el archivo que la persona acaba de guardar.
  const window = await openTarget();

  await typeMarker(window);
  await window.keyboard.press('Control+S');

  await expect(window.getByTestId('tab-dirty-indicator')).toBeHidden();

  // Si el watcher se colara, el diálogo aparecería en los segundos siguientes.
  await window.waitForTimeout(1500);
  await expect(window.getByTestId('conflict-dialog')).toBeHidden();
});
