import type { ChannelName, PasteCodeApi, Request, Response } from '@pastecode/ipc-contract';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Única superficie expuesta al renderer.
 *
 * Se expone el wrapper `invoke` y nada más. Exponer `ipcRenderer` completo le
 * daría al renderer —y a cualquier extensión o XSS que corra ahí— acceso a
 * `send`, `on` y a todos los canales internos de Electron, que es exactamente
 * lo que el contextBridge existe para evitar.
 */
const api: PasteCodeApi = {
  invoke: <C extends ChannelName>(channel: C, payload: Request<C>): Promise<Response<C>> =>
    // `ipcRenderer.invoke` devuelve `Promise<any>`: es el límite del sistema,
    // donde los tipos dejan de ser una garantía y pasan a ser una promesa que
    // alguien tiene que cumplir. La aserción está permitida acá por la regla 2
    // de docs/convenciones/codigo.md, y quien la cumple del otro lado es la
    // validación Zod del handler en el main, no esta línea.
    // eslint-disable-next-line no-restricted-syntax
    ipcRenderer.invoke(channel, payload) as Promise<Response<C>>,
};

contextBridge.exposeInMainWorld('pastecode', api);
