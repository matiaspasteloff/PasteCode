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
