import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';

import { devServerOrigin, devServerUrl } from '../environment.js';
import { watchMaximizedState } from '../ipc/window.js';
import { applyContentSecurityPolicy } from '../security/content-security-policy.js';
import { applyPermissionPolicy } from '../security/permissions.js';
import { currentSettings } from '../services/settings.js';

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
    ...windowIcon(),
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
  applyPermissionPolicy(window.webContents.session, APP_ORIGIN, devServerOrigin);

  // El botón de maximizar cambia de glifo también cuando nadie lo aprieta:
  // arrastrar la ventana al borde superior la maximiza. Ver ADR-0030.
  watchMaximizedState(window);

  window.once('ready-to-show', () => {
    window.show();
  });

  // `window.zoomLevel` en cada carga y no una sola vez: Chromium guarda el
  // zoom por origen y lo puede reponer al recargar, y el que manda es el de
  // las settings. Los cambios posteriores los aplica el broadcast de
  // `ipc/settings.ts`.
  window.webContents.on('did-finish-load', () => {
    window.webContents.setZoomLevel(currentSettings().window.zoomLevel);
  });

  // La navegación, las redirecciones, los `<webview>` y las ventanas nuevas
  // no se controlan acá: los cubre la guarda global de
  // `security/web-contents-guard.ts`, que se engancha a **todo** webContents
  // que se cree y no sólo a éste.

  // En producción se carga por el esquema propio y no con `loadFile`: bajo
  // `file://` el origen es opaco, y con eso Chromium no deja construir web
  // workers ni `default-src 'self'` significa nada. Ver ADR-0012.
  void window.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`);

  return window;
}

/**
 * El ícono de la ventana, sólo en Linux.
 *
 * En Windows la ventana toma el del `.exe` y en macOS el del bundle, que
 * electron-builder graba desde `build/icon.png`. En Linux el ejecutable no
 * lleva ícono: el escritorio lo saca del `.desktop` del instalador, y la
 * ventana, si no se le da uno, muestra el genérico. El PNG viaja a
 * `resources/` por `extraResources` (electron-builder.yml).
 */
function windowIcon(): { icon?: string } {
  if (process.platform !== 'linux') return {};
  return {
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : // `out/main/` → `apps/desktop/build/`.
        join(__dirname, '..', '..', 'build', 'icon.png'),
  };
}
