import type { ChannelName, Request, Response } from './channels.js';

/**
 * La única superficie que el preload expone al renderer.
 *
 * Vive en el contrato y no en `apps/desktop/src/preload` a propósito: si el
 * tipo viviera en el preload, el renderer tendría que importar desde una capa
 * privilegiada para tiparse, y esa es exactamente la flecha que la regla de
 * dependencias de docs/02-arquitectura.md prohíbe.
 *
 * @example
 * const { version } = await window.pastecode.invoke('app:getVersion', {});
 */
export interface PasteCodeApi {
  invoke<C extends ChannelName>(channel: C, payload: Request<C>): Promise<Response<C>>;
}
