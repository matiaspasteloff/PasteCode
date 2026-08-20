import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { DESKTOP_ROOT, makeTempDirectory } from './support/desktop.js';

/** El adaptador de prueba: un proceso de verdad que habla DAP por stdio. */
const FAKE_ADAPTER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'dap-adapter.mjs'
);

let app: ElectronApplication;
let workspace: string;
let home: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-dbgses-ws-'));
  home = await makeTempDirectory('pastecode-dbgses-home-');

  await writeFile(
    join(workspace, 'app.js'),
    'const a = 1;\nconst b = 2;\nconsole.log(a + b);\n',
    'utf8'
  );

  await mkdir(join(workspace, '.pastecode'), { recursive: true });
  await writeFile(
    join(workspace, '.pastecode', 'launch.json'),
    JSON.stringify({
      version: '0.2.0',
      configurations: [{ type: 'node', request: 'launch', name: 'App', program: 'app.js' }],
    }),
    'utf8'
  );

  // El adaptador se elige por settings del **usuario**: el workspace no puede
  // escribir esa clave, que es la regla que ADR-0028 hace cumplir.
  await writeFile(
    join(home, 'settings.json'),
    JSON.stringify({ version: 1, debug: { adapterPath: FAKE_ADAPTER } }),
    'utf8'
  );

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace, PASTECODE_E2E_HOME: home },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Abre el workspace, pone un breakpoint y muestra el panel de debug. */
async function prepare(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'app.js' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const a = 1;');

  await window
    .locator('.monaco-editor .margin-view-overlays > div')
    .nth(1)
    .click({ position: { x: 6, y: 6 } });
  await expect(window.locator('.breakpoint-glyph')).toHaveCount(1);

  // `Ctrl+\`` abre el panel inferior; recién ahí existen sus pestañas.
  await window.keyboard.press('Control+`');
  await window.getByRole('tab', { name: 'Depuración' }).click();
}

/**
 * RF-503, RF-504 y RF-505 de punta a punta, contra un adaptador de verdad.
 *
 * El adaptador es de prueba pero **el protocolo no**: es un proceso aparte que
 * habla DAP por stdio, así que este test recorre la cadena entera —encuadre,
 * correlación, coreografía del arranque, eventos, y las tres superficies de la
 * UI— sin depender de que haya un `vscode-js-debug` instalado.
 *
 * Va todo en un solo test porque son un solo flujo: no se puede mirar el stack
 * sin haber frenado, ni evaluar sin haber elegido un frame. Partirlo en cinco
 * sería repetir el arranque cinco veces para verificar un paso más cada vez.
 */
test('arranca una sesión, frena, muestra el stack, evalúa y termina', async () => {
  const window = await app.firstWindow();

  await prepare(window);

  // RF-503: arrancar. La configuración sale del `launch.json` del workspace.
  await window.getByTestId('debug-start-App').click();

  // El adaptador frena en el breakpoint, y el stack aparece solo: el freno lo
  // anuncia un evento y el renderer pide el stack al recibirlo.
  await expect(window.getByTestId('debug-stack')).toContainText('sumar', { timeout: 15_000 });
  await expect(window.getByTestId('debug-stack')).toContainText('principal');

  // RF-505: lo que el programa escribió llega a la consola.
  await expect(window.getByTestId('debug-console')).toContainText('arrancando');

  // RF-504: los scopes son variables expandibles, y sus hijos se piden al
  // expandir en vez de traer el árbol entero en cada freno.
  await expect(window.getByTestId('debug-variables')).toContainText('Local');
  await window.getByRole('button', { name: /Local/ }).click();
  await expect(window.getByTestId('debug-variables')).toContainText('a');

  // RF-505: evaluar en el frame seleccionado.
  const input = window.getByTestId('debug-console-input');

  await input.fill('a + 1');
  await input.press('Enter');
  await expect(window.getByTestId('debug-console')).toContainText('> a + 1');
  await expect(window.getByTestId('debug-console')).toContainText('2');

  // Una expresión que el adaptador rechaza es un resultado marcado, no un
  // error de la aplicación: la consola lo dibuja y el IDE sigue andando.
  await input.fill('no existe');
  await input.press('Enter');
  await expect(window.locator('.debug-console__line--stderr')).toContainText(
    'No se pudo evaluar'
  );

  // RF-503: continuar termina el programa, y la UI vuelve a poder arrancar otro.
  await window.getByTestId('debug-continue').click();
  await expect(window.getByTestId('debug-console')).toContainText('listo');
  await expect(window.getByTestId('debug-start-App')).toBeVisible({ timeout: 15_000 });

  // El IDE sigue vivo después de todo el ciclo.
  await expect(window.locator('.app__name')).toHaveText('PasteCode');
});
