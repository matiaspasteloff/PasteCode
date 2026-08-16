import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-edicion-'));
  await writeFile(
    join(workspace, 'uno.ts'),
    'const alfa = 1;\nconst alfa2 = 2;\nconst beta = 3;\n',
    'utf8'
  );

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
 * RF-103 y RF-105 en un solo test.
 *
 * Los dos son **funcionalidad nativa de Monaco**: no hay código nuestro que
 * los implemente, y el checklist de la Fase 2 los da por pendientes. Lo que
 * hay que verificar entonces no es que funcionen —funcionan— sino que el
 * resolver de keybindings de la aplicación **no les robe los atajos**, que es
 * exactamente el riesgo que introdujo la Etapa 3 al agregar `Ctrl+Shift+F` y
 * `Ctrl+P` al mapa global.
 */
test('RF-103 y RF-105: multi-cursor y buscar/reemplazar siguen llegando a Monaco', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const alfa = 1;');

  await window.locator('.monaco-editor .view-lines').click();

  // RF-105: Ctrl+F abre el buscador de Monaco. No está en DEFAULT_KEYBINDINGS,
  // así que el listener global lo deja pasar; `Ctrl+Shift+F`, que sí está, es
  // la búsqueda en el workspace y es otra cosa.
  await window.keyboard.press('Control+f');
  await expect(window.locator('.monaco-editor .find-widget')).toBeVisible();
  await window.keyboard.press('Escape');

  // RF-103: el primer Ctrl+D selecciona la palabra bajo el cursor —`const`— y
  // el segundo suma un cursor en la ocurrencia siguiente. Con los dos activos,
  // escribir reemplaza en las dos líneas de una sola vez.
  await window.keyboard.press('Control+Home');
  await window.keyboard.press('Control+d');
  await window.keyboard.press('Control+d');
  await window.keyboard.type('let');
  await window.keyboard.press('Escape');

  // Se mira `.view-lines` y no `.monaco-editor` entero: este último incluye
  // los números de línea del gutter y el texto del buscador, que ensucian la
  // comparación con cosas que no son el contenido del archivo.
  const lines = window.locator('.monaco-editor .view-lines');
  await expect(lines).toContainText('let alfa = 1;');
  await expect(lines).toContainText('let alfa2 = 2;');
  // La tercera línea no se tocó: eran dos cursores, no un reemplazo global.
  await expect(lines).toContainText('const beta = 3;');
});
