import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

/**
 * El hardening de la app empaquetada, visto desde el renderer: lo que una
 * página comprometida puede intentar, y que tiene que fallar.
 *
 * Corre contra el build de producción —sin `ELECTRON_RENDERER_URL`— porque es
 * la política estricta la que se distribuye. Ver docs/convenciones/seguridad.md
 * y ADR-0033.
 */
let app: ElectronApplication;

test.beforeEach(async () => {
  app = await electron.launch({ args: [DESKTOP_ROOT] });
});

test.afterEach(async () => {
  await app.close();
});

test('los permisos de Chromium se niegan por omisión', async () => {
  const window = await app.firstWindow();
  await expect(window.locator('.app__name')).toHaveText('PasteCode');

  const result = await window.evaluate(async () => {
    const geolocation = await navigator.permissions.query({ name: 'geolocation' });
    // `microphone` se responde con el handler de chequeo del permiso `media`.
    // Es la aserción fuerte de las dos sobre audio: sin handlers, Electron
    // contesta `granted`.
    const microphone = await navigator.permissions.query({ name: 'microphone' });

    // Sin micrófono en el runner, getUserMedia rechazaría igual; por eso no se
    // mira el nombre del error, sólo que no devuelva un stream.
    const userMedia = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => 'resolved')
      .catch(() => 'rejected');

    return {
      geolocation: geolocation.state,
      microphone: microphone.state,
      notifications: Notification.permission,
      userMedia,
    };
  });

  expect(result).toEqual({
    geolocation: 'denied',
    microphone: 'denied',
    notifications: 'denied',
    userMedia: 'rejected',
  });
});

test('window.open no crea ventanas y la navegación externa no sale del origen', async () => {
  const window = await app.firstWindow();
  await expect(window.locator('.app__name')).toHaveText('PasteCode');

  const countWindows = async (): Promise<number> =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);

  const before = await countWindows();
  const origin = new URL(window.url()).origin;

  // Un `file:` y no un `https:` a propósito: uno `https:` sí se manda al
  // navegador del sistema, y el test abriría una pestaña en el runner.
  const opened = await window.evaluate(
    () => globalThis.open('file:///c:/windows/win.ini') !== null
  );

  expect(opened).toBe(false);
  expect(await countWindows()).toBe(before);

  // `will-navigate` la cancela antes de que salga ningún request.
  await window.evaluate(() => {
    globalThis.location.href = 'https://example.com/';
  });
  await window.waitForTimeout(500);

  // La URL se lee desde el main y no con `window.url()` ni un locator: con la
  // navegación cancelada, Playwright se queda esperando a que "termine" una
  // navegación que nunca va a llegar.
  const current = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getURL()
  );

  expect(new URL(current ?? '').origin).toBe(origin);
});
