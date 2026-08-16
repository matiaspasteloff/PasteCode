import type {
  ChannelName,
  EventName,
  EventPayload,
  IpcResult,
  PasteCodeApi,
  Request,
  Response,
} from '@pastecode/ipc-contract';
import { isEventName } from '@pastecode/ipc-contract';
import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Única superficie expuesta al renderer.
 *
 * Se exponen `invoke` y `subscribe`, y nada más. Exponer `ipcRenderer` completo
 * le daría al renderer —y a cualquier extensión o XSS que corra ahí— acceso a
 * `send`, `on` y a todos los canales internos de Electron, que es exactamente
 * lo que el contextBridge existe para evitar.
 */
const api: PasteCodeApi = {
  invoke: <C extends ChannelName>(
    channel: C,
    payload: Request<C>
  ): Promise<IpcResult<Response<C>>> =>
    // `ipcRenderer.invoke` devuelve `Promise<any>`: es el límite del sistema,
    // donde los tipos dejan de ser una garantía y pasan a ser una promesa que
    // alguien tiene que cumplir. La aserción está permitida acá por la regla 2
    // de docs/convenciones/codigo.md, y quien la cumple del otro lado es
    // `registerHandler` en el main, no esta línea.
    // eslint-disable-next-line no-restricted-syntax
    ipcRenderer.invoke(channel, payload) as Promise<IpcResult<Response<C>>>,

  subscribe: <E extends EventName>(
    event: E,
    listener: (payload: EventPayload<E>) => void
  ): (() => void) => {
    // El tipo `EventName` no existe en runtime. Sin esta guarda, un renderer
    // comprometido llama `subscribe('ELECTRON_BROWSER_REQUIRE', ...)` y se
    // queda escuchando un canal interno de Electron con un contextBridge que
    // creía cerrado. La allow-list es lo que hace que `subscribe` sea tan
    // acotado como `invoke`, donde el main valida el canal del otro lado.
    // Se nombra antes de la guarda porque dentro del `if` TypeScript ya narrowó
    // `event` a `never` —el caso, por tipos, no puede pasar— y no se lo puede
    // ni interpolar en el mensaje. Por tipos no pasa; en runtime es todo lo que
    // separa al renderer de `ipcRenderer.on`.
    const name: string = event;

    if (!isEventName(name)) {
      throw new Error(`El renderer intentó suscribirse a un evento que no existe: "${name}"`);
    }

    // El listener del renderer nunca ve el `IpcRendererEvent`. Ese objeto trae
    // `sender`, `ports` y `senderFrame`, que son justamente la superficie de
    // Electron que el preload está para no entregar.
    const forward = (_event: IpcRendererEvent, payload: unknown): void => {
      // Misma aserción que en `invoke`, y por la misma razón: es el límite del
      // sistema. Del otro lado la cumple `emit` en el main.
      // eslint-disable-next-line no-restricted-syntax
      listener(payload as EventPayload<E>);
    };

    ipcRenderer.on(event, forward);

    // Idempotente a propósito: en React el cleanup de un `useEffect` puede
    // correr más de una vez, y desregistrar dos veces el mismo listener no es
    // un error que el llamador tenga que evitar.
    let subscribed = true;

    return () => {
      if (!subscribed) return;

      subscribed = false;
      ipcRenderer.off(event, forward);
    };
  },
};

contextBridge.exposeInMainWorld('pastecode', api);
