import { z } from 'zod';

/**
 * Un modelo, tal como lo consume la UI.
 *
 * Es deliberadamente chico: de las ~30 propiedades que devuelve OpenRouter,
 * el selector muestra dos y el recorte de contexto usa una. Cargar el resto
 * sería mandar por IPC un catálogo entero para pintar una lista.
 */
export const AiModelSchema = z.strictObject({
  /** El id que se manda en la request. Siempre termina en `:free`. */
  id: z.string().min(1),
  /** El nombre para mostrar. */
  name: z.string().min(1),
  /** Cuántos tokens entran en la ventana. Es el presupuesto de `trimToBudget`. */
  contextLength: z.int().positive(),
});

export type AiModel = z.infer<typeof AiModelSchema>;

/**
 * Un modelo tal como lo devuelve `/api/v1/models`, con lo que nos importa.
 *
 * Es laxo a propósito —`catchall` implícito por no ser `strictObject`— porque
 * es una respuesta ajena: OpenRouter agrega campos sin avisar, y un schema
 * estricto convertiría "sumaron una propiedad" en "el selector no lista
 * ningún modelo".
 */
const RawModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  context_length: z.number().optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
});

/** La respuesta entera de `/api/v1/models`. */
const ModelsResponseSchema = z.object({
  data: z.array(RawModelSchema),
});

/**
 * Ventana de contexto con la que se trabaja cuando el catálogo no la declara.
 *
 * 8k es el piso razonable de cualquier modelo actual. Es mejor recortar de
 * más que mandar una conversación que el servidor va a rechazar entera.
 */
const FALLBACK_CONTEXT_LENGTH = 8192;

/**
 * Filtra el catálogo de OpenRouter a los modelos que no cuestan nada.
 *
 * **Los dos criterios son necesarios y ninguno alcanza solo.** El precio en
 * cero es la verdad de si cobran; el sufijo `:free` es cómo OpenRouter nombra
 * la variante gratuita de un modelo que además tiene una paga. Sin el precio,
 * un modelo con `:free` en el nombre pero tarifa distinta de cero pasaría; sin
 * el sufijo, entrarían variantes de precio cero que en realidad son alias de
 * la paga y terminan facturando.
 *
 * Esto es [RF-1002](../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental):
 * la etapa experimental no puede generar un cargo sin que nadie lo haya
 * pedido. El filtro corre en el main —del lado del canal— y **además** la UI
 * sólo ofrece lo que devuelve; el de la UI evita el error, el del canal evita
 * el abuso.
 *
 * Es puro: entra lo que devolvió la API, sale la lista. Sin red, sin mocks.
 *
 * @param raw El JSON ya parseado de `/api/v1/models`.
 * @returns Los modelos gratuitos, ordenados por nombre.
 * @example
 * freeModels({ data: [{ id: 'x:free', pricing: { prompt: '0', completion: '0' } }] });
 */
export function freeModels(raw: unknown): AiModel[] {
  const parsed = ModelsResponseSchema.safeParse(raw);

  // Un catálogo que no parsea es una lista vacía y no una excepción: el
  // selector muestra "no hay modelos" y el resto del asistente sigue vivo.
  if (!parsed.success) return [];

  return parsed.data.data
    .filter(isFree)
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: contextLengthOf(model.context_length),
    }))
    .sort((one, other) => one.name.localeCompare(other.name));
}

/** Si un modelo del catálogo es gratuito, por precio **y** por nombre. */
function isFree(model: z.infer<typeof RawModelSchema>): boolean {
  return (
    model.id.endsWith(':free') &&
    model.pricing?.prompt === '0' &&
    model.pricing.completion === '0'
  );
}

/** La ventana declarada, o el piso si el catálogo no la trae o miente. */
function contextLengthOf(declared: number | undefined): number {
  if (declared === undefined || !Number.isInteger(declared) || declared <= 0) {
    return FALLBACK_CONTEXT_LENGTH;
  }

  return declared;
}
