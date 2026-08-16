import type { ChannelName, Request, Response } from './channels.js';
import type { EventName, EventPayload } from './events.js';
import type { IpcResult } from './result.js';

/**
 * La única superficie que el preload expone al renderer.
 *
 * Vive en el contrato y no en `apps/desktop/src/preload` a propósito: si el
 * tipo viviera en el preload, el renderer tendría que importar desde una capa
 * privilegiada para tiparse, y esa es exactamente la flecha que la regla de
 * dependencias de docs/02-arquitectura.md prohíbe.
 *
 * El `IpcResult` está acá y no en cada canal para que la uniformidad sea
 * imposible de olvidar: agregar un canal no incluye la decisión de si sus
 * errores viajan bien. Ver ADR-0011.
 *
 * @example
 * const result = await window.pastecode.invoke('app:getVersion', {});
 * if (result.ok) console.warn(result.value.version);
 */
export interface PasteCodeApi {
  invoke<C extends ChannelName>(
    channel: C,
    payload: Request<C>
  ): Promise<IpcResult<Response<C>>>;

  /**
   * Escucha un evento que empuja el main.
   *
   * No hay `IpcResult` acá: un evento no es una pregunta que pueda fallar. Lo
   * que el main tiene para decir cuando algo salió mal viaja *dentro* del
   * payload, como un campo más, porque el error de un PTY que murió no es el
   * error de haberse suscripto.
   *
   * Devolver el unsubscribe y no exponer un `off(event, listener)` es
   * deliberado: con `off` hay que conservar la referencia exacta a la función,
   * y el listener que llega al preload no es el que se registra en
   * `ipcRenderer` —se lo envuelve para no filtrar el `IpcRendererEvent`, que
   * trae el `sender` y con él toda la superficie de Electron—. Un `off` que
   * recibe el listener original tendría que mantener un mapa de equivalencias
   * y fallar en silencio cuando no encuentra la entrada. La clausura no.
   *
   * @param event Nombre del contrato. Cualquier otra cosa lanza.
   * @param listener Se llama con el payload, sin el evento de Electron.
   * @returns La función que corta la suscripción. Idempotente.
   * @example
   * useEffect(() => window.pastecode.subscribe('terminal:data', onData), [onData]);
   */
  subscribe<E extends EventName>(
    event: E,
    listener: (payload: EventPayload<E>) => void
  ): () => void;
}
