import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { DESKTOP_ROOT, makeTempDirectory } from './support/desktop.js';

let app: ElectronApplication;
let workspace: string;
let home: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-debug-ws-'));
  home = await makeTempDirectory('pastecode-debug-home-');

  await writeFile(
    join(workspace, 'app.js'),
    'const a = 1;\nconst b = 2;\nconsole.log(a + b);\n',
    'utf8'
  );
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Levanta la app contra el workspace y el home temporales. */
async function launch(): Promise<Page> {
  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace, PASTECODE_E2E_HOME: home },
  });

  return app.firstWindow();
}

/** Abre `app.js` y espera a que el editor lo muestre. */
async function openApp(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'app.js' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const a = 1;');
}

/**
 * RF-502: un click en el gutter pone el breakpoint, y sobrevive a reabrir.
 *
 * Las dos mitades del requerimiento en un solo test, porque la segunda no
 * significa nada sin la primera. Lo que se verifica de la persistencia es que
 * el punto vuelva a **dibujarse**, no que el archivo de sesión tenga una clave:
 * eso último ya lo cubren los unitarios, y pasaría igual si la restauración no
 * llegara nunca a la UI.
 */
test('un breakpoint puesto en el gutter sigue ahí al reabrir el workspace', async () => {
  const window = await launch();

  await openApp(window);

  // El margen de glifos de la segunda línea. Se hace click por coordenadas
  // porque es lo que hace una persona: Monaco no expone el margen como un rol.
  const line = window.locator('.monaco-editor .margin-view-overlays > div').nth(1);

  await line.click({ position: { x: 6, y: 6 } });

  await expect(window.locator('.breakpoint-glyph')).toHaveCount(1);

  // La sesión se escribe con debounce en el main; cerrar la app la vacía.
  await app.close();

  const reopened = await launch();

  await openApp(reopened);

  await expect(reopened.locator('.breakpoint-glyph')).toHaveCount(1);
});

/**
 * RF-501: el `launch.json` se lee y se valida, y uno roto se ve.
 *
 * Se consulta por el mismo canal que usaría la UI. Que un archivo inválido
 * devuelva cero configuraciones **y** un mensaje —y no una excepción— es lo que
 * hace que el resto del IDE siga andando, que es la mitad que importa.
 */
test('lee el launch.json del workspace y reporta el que está roto', async () => {
  await mkdir(join(workspace, '.pastecode'), { recursive: true });
  await writeFile(
    join(workspace, '.pastecode', 'launch.json'),
    `{
      // el de todos los días
      "version": "0.2.0",
      "configurations": [
        { "type": "node", "request": "launch", "name": "Correr app.js", "program": "app.js" }
      ]
    }`,
    'utf8'
  );

  const window = await launch();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  const listed: unknown = await window.evaluate(
    `window.pastecode.invoke('debug:getConfigurations', {}).then((r) => (r.ok ? r.value : null))`
  );

  // Los comentarios se aceptan: el `launch.json` del ecosistema es JSONC.
  expect(listed).toMatchObject({
    configurations: [{ type: 'node', request: 'launch', name: 'Correr app.js' }],
    error: null,
  });

  // Y ahora uno roto, sin reiniciar la app: se lee al pedirlo.
  await writeFile(
    join(workspace, '.pastecode', 'launch.json'),
    '{ "configurations": [{}] }',
    'utf8'
  );

  const broken: unknown = await window.evaluate(
    `window.pastecode.invoke('debug:getConfigurations', {}).then((r) => (r.ok ? r.value : null))`
  );

  // Cero configuraciones **y** un mensaje: son dos cosas que la UI muestra en
  // lugares distintos, así que viajan juntas en vez de una en lugar de la otra.
  expect(broken).toMatchObject({ configurations: [] });
  expect(broken).not.toMatchObject({ error: null });
});

/**
 * ADR-0028: sin adaptador configurado, el debugging queda apagado con
 * explicación y el resto del IDE intacto.
 */
test('sin adaptador configurado el debugging queda apagado, no roto', async () => {
  const window = await launch();

  const status: unknown = await window.evaluate(
    `window.pastecode.invoke('debug:getStatus', {}).then((r) => (r.ok ? r.value : null))`
  );

  expect(status).toMatchObject({ state: 'unavailable', threadId: null });

  // La mitad que importa: la app sigue andando.
  await expect(window.locator('.app__name')).toHaveText('PasteCode');
});
