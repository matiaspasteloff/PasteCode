import { app, shell } from 'electron';

import { isAllowedNavigation, isSafeExternalUrl } from './navigation.js';

/** Un evento que se puede cancelar. Es lo único que la guarda usa de él. */
interface PreventableEvent {
  preventDefault(): void;
}

/** Los eventos de navegación traen la URL destino en el propio evento. */
interface NavigationEvent extends PreventableEvent {
  readonly url: string;
}

/**
 * Lo que la guarda necesita de un `webContents`.
 *
 * `WebContents` de Electron lo cumple estructuralmente. Pedir la interfaz
 * mínima y no la clase es lo que deja testear la guarda en Node sin levantar
 * una app, igual que `MaximizableWindow` en `main/ipc/window.ts`.
 *
 * La URL de la navegación se lee de `details.url` y no del segundo argumento
 * del listener, que Electron marca como deprecado.
 */
export interface GuardedWebContents {
  on(event: 'will-attach-webview', listener: (event: PreventableEvent) => void): unknown;
  on(
    event: 'will-navigate' | 'will-redirect',
    listener: (details: NavigationEvent) => void
  ): unknown;
  setWindowOpenHandler(
    handler: (details: { readonly url: string }) => { action: 'deny' }
  ): void;
}

/**
 * Aplica la política de navegación y de ventanas a un `webContents`.
 *
 * - **`<webview>`**: se impide siempre. La app no lo usa, y un `<webview>`
 *   inyectado es una página remota con sus propias `webPreferences`.
 * - **Navegación y redirección**: sólo hacia el origen de la app. Un
 *   `will-redirect` es la misma navegación vista desde el servidor: sin
 *   cancelarlo, un 302 se saltea lo que `will-navigate` acaba de permitir.
 * - **Ventanas nuevas**: ninguna. Si la URL es segura para el navegador del
 *   sistema, se le pasa; si no, se descarta.
 *
 * @param contents El `webContents` a proteger.
 * @param appOrigin Origen propio de la app.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @param openExternal Cómo se abre una URL en el navegador del sistema.
 * @example
 * guardWebContents(window.webContents, APP_ORIGIN, undefined, (url) => {
 *   void shell.openExternal(url);
 * });
 */
export function guardWebContents(
  contents: GuardedWebContents,
  appOrigin: string,
  devServerOrigin: string | undefined,
  openExternal: (url: string) => void
): void {
  const blockForeignNavigation = (details: NavigationEvent): void => {
    if (!isAllowedNavigation(details.url, appOrigin, devServerOrigin)) details.preventDefault();
  };

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.on('will-navigate', blockForeignNavigation);
  contents.on('will-redirect', blockForeignNavigation);

  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * Instala la guarda en **todo** `webContents` que se cree, no sólo en el de
 * la ventana principal.
 *
 * Atarla a una ventana en particular era el hueco: cualquier `webContents`
 * que apareciera por otro camino —una ventana auxiliar el día de mañana, un
 * `<webview>`, una página de DevTools— nacía sin reglas. Con
 * `web-contents-created` no hay forma de crear uno sin pasar por acá.
 *
 * **Se llama una vez, antes de `app.whenReady()`**, para que no haya ningún
 * `webContents` anterior al listener.
 *
 * @param appOrigin Origen propio de la app.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @example
 * installWebContentsGuard(APP_ORIGIN, devServerOrigin); // en main/index.ts
 */
export function installWebContentsGuard(
  appOrigin: string,
  devServerOrigin: string | undefined
): void {
  app.on('web-contents-created', (_event, contents) => {
    guardWebContents(contents, appOrigin, devServerOrigin, (url) => {
      void shell.openExternal(url);
    });
  });
}
