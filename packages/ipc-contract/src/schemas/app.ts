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
