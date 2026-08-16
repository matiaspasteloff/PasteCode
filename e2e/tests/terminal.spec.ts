import { mkdtemp, rm } from 'node:fs/promises';
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
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-e2e-terminal-'));

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
});

test('abre terminales, corre un comando y esconde el panel sin matarlas', async () => {
  // Van los tres pasos en un solo test y no en tres porque son un solo flujo y
  // porque el tope de 30 E2E de testing.md manda fusionar antes que sumar.
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  await window.keyboard.press('Control+`');

  const panel = window.getByRole('region', { name: 'Terminal integrada' });
  await expect(panel).toBeVisible();

  // Es el primer evento del main al renderer que existe de punta a punta, así
  // que esto también ejerce el `subscribe` de ADR-0013: sin él no aparecería
  // una sola letra en pantalla.
  await window.keyboard.type('echo pastecode-e2e\r');
  await expect(panel).toContainText('pastecode-e2e', { timeout: 20_000 });

  // RF-302: una segunda sesión, con su propio nombre en la lista.
  const sessions = window.getByRole('list', { name: 'Terminales abiertas' });
  await window.getByRole('button', { name: 'Abrir otra terminal' }).click();
  await expect(sessions.getByRole('button')).toHaveCount(4);

  await window.keyboard.press('Control+`');
  await expect(panel).toBeHidden();
  await window.keyboard.press('Control+`');

  // Si esconder el panel matara las sesiones, acá habría una sola y vacía. Un
  // `npm run dev` corriendo tiene que sobrevivir a que no se lo mire.
  await expect(panel).toBeVisible();
  await expect(sessions.getByRole('button')).toHaveCount(4);
});

test('no deja procesos huérfanos al cerrar la aplicación', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.keyboard.press('Control+`');
  await expect(window.getByRole('region', { name: 'Terminal integrada' })).toBeVisible();

  // El pid del shell, preguntado al main. RF-305 pide cero huérfanos y eso no
  // se verifica mirando la UI: hay que buscar el proceso en el sistema.
  const reported: unknown = await app.evaluate(async ({ BrowserWindow }) => {
    const [main] = BrowserWindow.getAllWindows();

    // `executeJavaScript` devuelve `Promise<any>`: es el límite entre el test y
    // el renderer, y del otro lado no hay tipos que lo sostengan. Se envuelve
    // en un objeto para que el `any` no se propague por el `return`; lo que
    // llegue se estrecha abajo, con una comprobación de verdad.
    const pid: unknown = await main?.webContents.executeJavaScript(
      `window.pastecode.invoke('terminal:list', {}).then((r) => r.ok ? r.value.sessions[0]?.pid ?? 0 : 0)`
    );

    return pid;
  });

  // `executeJavaScript` devuelve `any`: es el límite entre el test y el
  // renderer. Se estrecha con una comprobación en vez de una aserción, que es
  // lo que la regla 2 de codigo.md pide y lo que además hace que el test falle
  // con un mensaje útil si el canal cambia de forma.
  if (typeof reported !== 'number') throw new Error(`terminal:list no devolvió un pid`);

  const pid = reported;

  expect(pid).toBeGreaterThan(0);

  await app.close();

  // `process.kill(pid, 0)` no mata: sólo pregunta si el proceso existe. Se
  // sondea porque terminar no es instantáneo en ninguna plataforma.
  await expect
    .poll(
      () => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 15_000, message: `el proceso ${String(pid)} sobrevivió al cierre de la app` }
    )
    .toBe(false);
});
