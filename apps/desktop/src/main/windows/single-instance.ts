import { app, BrowserWindow } from 'electron';

/**
 * Decide si esta instancia tiene que pedir el bloqueo de instancia única.
 *
 * Siempre, salvo bajo el directorio de datos del E2E. Ahí cada test lanza su
 * propia app contra su propio directorio temporal, y aunque hoy corran de a
 * una, que la suite dependa de que la anterior terminó de cerrarse antes de
 * lanzar la siguiente es un flaky esperando su turno. Dos instancias con
 * directorios distintos no comparten nada que el bloqueo proteja.
 *
 * `dataDirectoryOverride` ya es `undefined` en la app empaquetada, aunque
 * alguien setee la variable: no hay forma de desactivar el bloqueo en el
 * instalador.
 *
 * @param dataDirectoryOverride El directorio de datos del E2E, o `undefined`.
 * @returns `true` si hay que pedir el bloqueo.
 * @example
 * shouldRequestSingleInstanceLock(undefined);          // true
 * shouldRequestSingleInstanceLock('/tmp/pastecode-e2e'); // false
 */
export function shouldRequestSingleInstanceLock(
  dataDirectoryOverride: string | undefined
): boolean {
  return dataDirectoryOverride === undefined;
}

/** Lo que `revealWindow` necesita de una ventana. `BrowserWindow` lo cumple. */
export interface RevealableWindow {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

/**
 * Trae al frente una ventana: la restaura si estaba minimizada y le da el foco.
 *
 * @param window La ventana, o `undefined` si todavía no hay ninguna.
 * @example
 * revealWindow(BrowserWindow.getAllWindows()[0]);
 */
export function revealWindow(window: RevealableWindow | undefined): void {
  if (window === undefined) return;

  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * Reclama la instancia única.
 *
 * Dos instancias a la vez compiten por los mismos archivos —sesión, settings,
 * backups, la clave del asistente— y la que escribe última gana sin que nadie
 * se entere. Con el bloqueo, abrir la app de nuevo trae al frente la que ya
 * estaba.
 *
 * @param dataDirectoryOverride El directorio de datos del E2E, o `undefined`.
 * @returns `false` si ya hay otra instancia: quien llama tiene que salir sin
 *   registrar nada más.
 * @example
 * if (!claimSingleInstance(dataDirectoryOverride)) app.quit();
 */
export function claimSingleInstance(dataDirectoryOverride: string | undefined): boolean {
  if (!shouldRequestSingleInstanceLock(dataDirectoryOverride)) return true;

  if (!app.requestSingleInstanceLock()) return false;

  app.on('second-instance', () => {
    revealWindow(BrowserWindow.getAllWindows()[0]);
  });

  return true;
}
