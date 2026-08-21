import { join } from 'node:path';

import { BrowserWindow, shell } from 'electron';

import { devServerOrigin, devServerUrl } from '../environment.js';
import { watchMaximizedState } from '../ipc/window.js';
import { applyContentSecurityPolicy } from '../security/content-security-policy.js';
import { isAllowedNavigation, isSafeExternalUrl } from '../security/navigation.js';

import { APP_ORIGIN } from './app-protocol.js';

/**
 * Crea la ventana principal con el hardening completo de
 * docs/convenciones/seguridad.md aplicado desde el primer commit.
 *
 * @returns La ventana creada.
 * @example
 * void app.whenReady().then(() => createMainWindow());
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    // Mostrarla recién en `ready-to-show` evita el flash de ventana blanca.
    show: false,
    title: 'PasteCode',
    // Sin marco nativo: la barra de título la dibuja el renderer
    // ([ADR-0030](../../../../../docs/adr/0030-barra-de-titulo-propia.md)).
    // **`webPreferences` no cambia ni una coma** por esto: el marco es
    // decoración de la ventana, no un permiso del renderer, así que la regla 1
    // de CLAUDE.md ni se roza. El arrastre y el doble click para maximizar
    // salen de `-webkit-app-region` en el CSS, sin una línea de JavaScript.
    frame: false,
    // El mínimo existe porque sin marco no hay quien impida achicar la ventana
    // hasta que la barra de menús se coma la caja de comandos.
    minWidth: 680,
    minHeight: 420,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  applyContentSecurityPolicy(window.webContents.session, devServerOrigin);

  // El botón de maximizar cambia de glifo también cuando nadie lo aprieta:
  // arrastrar la ventana al borde superior la maximiza. Ver ADR-0030.
  watchMaximizedState(window);

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, APP_ORIGIN, devServerOrigin)) event.preventDefault();
  });

  // Los links externos abren en el navegador del sistema, nunca en la app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // En producción se carga por el esquema propio y no con `loadFile`: bajo
  // `file://` el origen es opaco, y con eso Chromium no deja construir web
  // workers ni `default-src 'self'` significa nada. Ver ADR-0012.
  void window.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`);

  return window;
}
