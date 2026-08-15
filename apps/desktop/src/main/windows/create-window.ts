import { join } from 'node:path';

import { BrowserWindow, shell } from 'electron';

import { devServerOrigin, devServerUrl } from '../environment.js';
import { applyContentSecurityPolicy } from '../security/content-security-policy.js';
import { isAllowedNavigation, isSafeExternalUrl } from '../security/navigation.js';

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

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devServerOrigin)) event.preventDefault();
  });

  // Los links externos abren en el navegador del sistema, nunca en la app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (devServerUrl !== undefined) void window.loadURL(devServerUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));

  return window;
}
