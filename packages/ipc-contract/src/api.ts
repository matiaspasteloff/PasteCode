import type { ChannelName, Request, Response } from './channels.js';
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
}
