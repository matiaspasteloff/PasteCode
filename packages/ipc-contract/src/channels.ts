import { z } from 'zod';

/**
 * Payload de `app:getVersion`. El canal no recibe datos, pero el objeto vacío
 * estricto no es ceremonia: hace que mandar cualquier cosa desde el renderer
 * sea un error de validación en vez de un campo que el handler ignora en
 * silencio. Ver docs/convenciones/seguridad.md — el renderer no es de confianza.
 */
export const GetVersionRequestSchema = z.strictObject({});

/** Respuesta de `app:getVersion`: la versión del `package.json` de la app. */
export const GetVersionResponseSchema = z.strictObject({
  version: z.string().min(1),
});

/**
 * Mapa de canales de IPC. **Es la fuente de verdad**: agregar un canal empieza
 * acá y recién después toca el main, el preload y el renderer.
 *
 * @example
 * type V = Response<'app:getVersion'>; // { version: string }
 */
export interface IpcChannels {
  'app:getVersion': {
    request: z.infer<typeof GetVersionRequestSchema>;
    response: z.infer<typeof GetVersionResponseSchema>;
  };
}

export type ChannelName = keyof IpcChannels;
export type Request<C extends ChannelName> = IpcChannels[C]['request'];
export type Response<C extends ChannelName> = IpcChannels[C]['response'];
