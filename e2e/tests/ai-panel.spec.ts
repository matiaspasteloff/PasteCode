import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

/** Un rectángulo que Playwright pudo medir, sin `null` que propagar. */
interface Box {
  x: number;
  width: number;
}

/**
 * Mide un elemento y falla el test si no está en pantalla.
 *
 * Devolver `{ x: 0 }` ante un `null` convertiría "el panel no se abrió" en una
 * comparación de coordenadas que puede pasar por casualidad.
 */
async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();

  expect(box, 'el elemento tiene que estar en pantalla para medirlo').not.toBeNull();

  return { x: box?.x ?? 0, width: box?.width ?? 0 };
}

/**
 * El panel del asistente, **sin clave de API**.
 *
 * Todo lo que se verifica acá es geometría y ruteo de vistas: dónde vive el
 * panel, quién lo abre y que abrirlo no le saque el lugar al explorador. Nada
 * de eso necesita hablar con OpenRouter, y meter una clave en un E2E lo
 * convertiría en un test que depende de una red y de la cuota de alguien —lo
 * contrario de los `retries: 0` de la configuración—.
 */
let app: ElectronApplication;
let workspace: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-ai-panel-'));
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
 * Abre la carpeta de prueba y deja el foco en el documento.
 *
 * Las dos cosas hacen falta para que un atajo dispare: `ctrl+shift+e` lleva
 * `when: hasWorkspace`, y el listener de teclas vive en el documento. Es el
 * mismo `readyWindow` de `keybindings.spec.ts`.
 */
async function openedWindow(): Promise<Page> {
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).waitFor();
  await window.locator('.status-bar').click();

  return window;
}

test('el botón de la barra de título abre y cierra el panel', async () => {
  const window = await app.firstWindow();
  const toggle = window.getByTestId('toolbar-ai');

  await expect(window.getByTestId('aux-view')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  // El click de verdad, y no un `evaluate`, es la mitad del valor de este
  // test: `.title-toolbar` es una región de arrastre, y un control sin
  // `no-drag` adentro de ella **no recibe clicks**. El síntoma no se parece a
  // la causa, así que sólo lo caza apretarlo.
  await toggle.click();

  await expect(window.getByTestId('aux-view')).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();

  await expect(window.getByTestId('aux-view')).toHaveCount(0);
});

test('el asistente ya no está en el rail de actividades', async () => {
  // Se mudó a la derecha: dejar la entrada en el rail sería tenerlo en los dos
  // lados, y el rail se dibuja recorriendo `SIDE_VIEW_REGISTRY`.
  const window = await app.firstWindow();

  await expect(window.getByTestId('activity-explorer')).toBeVisible();
  await expect(window.getByTestId('activity-ai')).toHaveCount(0);
});

test('el panel abre a la derecha del editor, no encima del explorador', async () => {
  const window = await app.firstWindow();

  await window.getByTestId('toolbar-ai').click();
  await expect(window.getByTestId('aux-view')).toBeVisible();

  const sidebar = await boxOf(window.locator('.sidebar'));
  const editor = await boxOf(window.locator('.editor-area'));
  const aux = await boxOf(window.getByTestId('aux-view'));

  // Son dos ejes independientes: el explorador sigue a la izquierda con el
  // asistente abierto, y el editor queda en el medio.
  expect(aux.x).toBeGreaterThan(editor.x);
  expect(editor.x).toBeGreaterThan(sidebar.x);
});

test('el editor se angosta y no queda un hueco al abrir el panel', async () => {
  const window = await app.firstWindow();
  const before = await boxOf(window.locator('.editor-area'));

  await window.getByTestId('toolbar-ai').click();
  await expect(window.getByTestId('aux-view')).toBeVisible();

  const after = await boxOf(window.locator('.editor-area'));
  const aux = await boxOf(window.getByTestId('aux-view'));

  expect(after.width).toBeLessThan(before.width);
  // El borde derecho del editor toca el izquierdo del panel: si la grilla
  // dejara una columna vacía en el medio, esto se vería como un hueco. Es
  // exactamente el bug que las columnas explícitas arreglaron al colapsar el
  // explorador, del otro lado de la pantalla.
  expect(Math.abs(after.x + after.width - aux.x)).toBeLessThan(2);
});

test('Ctrl+Shift+E sigue abriendo el explorador a la izquierda', async () => {
  const window = await openedWindow();

  await window.getByTestId('toolbar-ai').click();
  await expect(window.getByTestId('aux-view')).toBeVisible();

  // Colapsa el explorador y lo vuelve a abrir: el atajo no perdió nada por la
  // mudanza del asistente.
  await window.keyboard.press('Control+Shift+E');
  await expect(window.locator('.sidebar')).toHaveCount(0);

  await window.keyboard.press('Control+Shift+E');

  await expect(window.locator('.sidebar')).toBeVisible();
  await expect(window.getByTestId('aux-view')).toBeVisible();
});
