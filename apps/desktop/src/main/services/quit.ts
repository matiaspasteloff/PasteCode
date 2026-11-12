import { flushSession } from '../ipc/session.js';

import { disposeAll } from './shutdown.js';

/** La salida en curso, si ya empezó. */
let shutdown: Promise<void> | undefined;

/**
 * Guarda la sesión y apaga todos los subsistemas, **una sola vez**.
 *
 * Hay dos caminos que cierran la app y los dos tienen que matar a los procesos
 * hijo antes (RNF-10): la salida normal, desde `before-quit`, y la instalación
 * de una actualización, desde `update:install`. El segundo no puede depender
 * del primero: el instalador de NSIS arranca apenas se lo lanza y cierra lo
 * que encuentre abierto, así que los hijos se apagan **antes** de lanzarlo.
 * Después, el `app.quit()` del actualizador vuelve a pasar por `before-quit`,
 * que encuentra esta promesa ya resuelta y sale sin repetir nada.
 *
 * Nunca rechaza: si la sesión no se pudo guardar, la salida sigue igual.
 *
 * @returns La promesa de la salida, la misma para todos los que la pidan.
 * @example
 * void shutdownOnce().finally(() => app.quit());
 */
export function shutdownOnce(): Promise<void> {
  shutdown ??= flushSession()
    .catch(() => undefined)
    .then(() => disposeAll());
  return shutdown;
}
