import { SettingsFileSchema, SettingsSchema } from '@pastecode/core';
import { z } from 'zod';

/**
 * El contrato importa el schema de `@pastecode/core` en vez de redefinirlo.
 *
 * Es la única dependencia que tiene el contrato además de Zod, y va en esta
 * dirección porque el schema de settings **es lógica del dominio** —tiene
 * rangos, defaults y una semántica de merge— y por lo tanto vive en `core`,
 * que es donde vive lo que se testea sin I/O. No hay ciclo: `core` no importa
 * el contrato ni lo va a importar.
 *
 * La alternativa era duplicar la forma acá, y dos definiciones del mismo
 * schema en dos paquetes es exactamente la clase de cosa que se desincroniza
 * sin que nadie lo note hasta que un valor válido en un lado se rechaza en el
 * otro.
 */

/**
 * El error de lectura, cuando lo hay, **al lado de las settings buenas**.
 *
 * Es la forma que exige [RNF-25](../../../../docs/04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad)
 * para este caso: un `settings.json` con una coma de más no puede tumbar la
 * aplicación ni dejarla sin configuración. Se sigue trabajando con los últimos
 * valores válidos **y** se muestra qué pasó. Devolver una cosa o la otra
 * obligaría a elegir entre las dos.
 */
const SettingsErrorSchema = z.strictObject({
  code: z.string(),
  userMessage: z.string(),
});

/** Payload de `settings:get`. */
export const GetSettingsRequestSchema = z.strictObject({});

/** Respuesta de `settings:get`: las settings resueltas y el error, si hubo. */
export const GetSettingsResponseSchema = z.strictObject({
  settings: SettingsSchema,
  error: SettingsErrorSchema.nullable(),
});

/**
 * Payload de `settings:update`.
 *
 * `scope` es explícito y no se deduce de si hay workspace abierto: escribir en
 * el archivo equivocado es de las cosas más molestas que le puede hacer un
 * editor a alguien, y "adiviné mal" no es una explicación aceptable.
 *
 * El `settings` es **parcial**: se escribe lo que se pide y se conserva lo
 * demás. Mandar el objeto resuelto entero convertiría cada cambio de una tecla
 * en un archivo con las cien claves escritas a mano.
 */
export const UpdateSettingsRequestSchema = z.strictObject({
  scope: z.enum(['user', 'workspace']),
  settings: SettingsFileSchema,
});

/** Respuesta de `settings:update`: las settings resueltas después del cambio. */
export const UpdateSettingsResponseSchema = z.strictObject({
  settings: SettingsSchema,
  error: SettingsErrorSchema.nullable(),
});
