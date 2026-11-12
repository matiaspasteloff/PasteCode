import type { InstallKind, UpdateEvent } from '@pastecode/core';

import type { UpdaterBackend } from './updater.js';

/**
 * Lo que se usa del `autoUpdater` de electron-updater, con los nombres de sus
 * tipos (`AppUpdater` y `AppUpdaterEvents` en `electron-updater/out`). Es
 * estructural a propósito: el test le pasa un emisor falso.
 */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(
    event: 'update-not-available' | 'update-available' | 'update-downloaded',
    listener: (info: { version: string }) => void
  ): unknown;
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

/**
 * Envuelve el `autoUpdater` de electron-updater en la interfaz del servicio.
 *
 * **Apaga las dos cosas que electron-updater hace solo por omisión**:
 * `autoDownload` —descargar apenas encuentra una versión— y
 * `autoInstallOnAppQuit` —instalar lo descargado al cerrar—. Es la regla del
 * proyecto: nada se descarga ni se instala sin que la persona lo pida.
 *
 * @param updater El `autoUpdater` de electron-updater.
 * @returns El backend para `createUpdateService`.
 * @example
 * const { autoUpdater } = await import('electron-updater');
 * const backend = createElectronUpdaterBackend(autoUpdater);
 */
export function createElectronUpdaterBackend(updater: AutoUpdaterLike): UpdaterBackend {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;

  return {
    onEvent: (listener: (event: UpdateEvent) => void) => {
      updater.on('checking-for-update', () => {
        listener({ type: 'checking' });
      });
      updater.on('update-not-available', () => {
        listener({ type: 'not-available' });
      });
      updater.on('update-available', (info) => {
        listener({ type: 'available', version: info.version });
      });
      updater.on('download-progress', (info) => {
        listener({ type: 'progress', percent: info.percent });
      });
      updater.on('update-downloaded', (info) => {
        listener({ type: 'downloaded', version: info.version });
      });
      updater.on('error', (error) => {
        listener({ type: 'error', message: error.message });
      });
    },
    setAllowPrerelease: (allow) => {
      updater.allowPrerelease = allow;
    },
    check: async () => {
      await updater.checkForUpdates();
    },
    download: async () => {
      await updater.downloadUpdate();
    },
    install: () => {
      updater.quitAndInstall();
    },
  };
}

/**
 * Carga electron-updater y devuelve su backend. Con `import()` y no con un
 * `import` de arriba: así Vite lo deja en un chunk aparte que el main recién
 * lee en el primer chequeo, varios segundos después de mostrar la ventana.
 *
 * @returns El backend sobre el `autoUpdater` real.
 * @example
 * createUpdateService({ ..., loadBackend: loadElectronUpdaterBackend });
 */
export async function loadElectronUpdaterBackend(): Promise<UpdaterBackend> {
  const { autoUpdater } = await import('electron-updater');
  return createElectronUpdaterBackend(autoUpdater);
}

/**
 * Cómo se instaló la app, para `canInstallInApp`.
 *
 * El portable de Windows lo delata `PORTABLE_EXECUTABLE_DIR`, que el lanzador
 * NSIS del portable define antes de arrancar la app (`portable.nsi` de
 * app-builder-lib). El AppImage, `APPIMAGE`, que define el runtime de AppImage
 * y es lo mismo que consulta el `AppImageUpdater` de electron-updater. En
 * Linux, lo que no es AppImage se trata como `deb`: es el otro destino que se
 * publica.
 *
 * @param platform `process.platform`.
 * @param isPackaged `app.isPackaged`.
 * @param env `process.env`.
 * @returns La forma de instalación.
 * @example
 * detectInstallKind('linux', true, { APPIMAGE: '/home/a/PasteCode.AppImage' }); // 'appimage'
 */
export function detectInstallKind(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  env: NodeJS.ProcessEnv
): InstallKind {
  if (!isPackaged) return 'unpackaged';
  if (platform === 'win32')
    return env.PORTABLE_EXECUTABLE_DIR === undefined ? 'nsis' : 'portable';
  if (platform === 'darwin') return 'dmg';
  return env.APPIMAGE === undefined ? 'deb' : 'appimage';
}
