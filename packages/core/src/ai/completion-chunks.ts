import { z } from 'zod';

/** Una llamada a herramienta, ya armada a partir de sus trozos. */
export interface ToolCallRequest {
  /** El id que eligió el modelo. Vuelve en el mensaje de resultado. */
  id: string;
  name: string;
  /** Los argumentos, como el string JSON que mandó el modelo. Sin parsear. */
  arguments: string;
}

/** Lo que se lleva acumulado de una respuesta. */
export interface CompletionState {
  /** El texto, concatenado. */
  content: string;
  /** Las llamadas a herramienta, por índice de la respuesta. */
  toolCalls: ToolCallRequest[];
  /** Por qué terminó, si el modelo ya lo dijo. */
  finishReason: string | null;
}

/** El estado del que se parte. */
export const EMPTY_COMPLETION: CompletionState = {
  content: '',
  toolCalls: [],
  finishReason: null,
};

/**
 * Un chunk del stream, con lo que nos importa.
 *
 * Laxo a propósito, igual que el catálogo de modelos: es una respuesta ajena,
 * y un campo nuevo no puede convertir "el modelo contestó" en "no llegó nada".
 */
const ChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullable().optional(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number(),
                  id: z.string().optional(),
                  function: z
                    .object({
                      name: z.string().optional(),
                      arguments: z.string().optional(),
                    })
                    .optional(),
                })
              )
              .optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      })
    )
    .optional(),
});

/**
 * Aplica un chunk del stream al estado acumulado.
 *
 * **Las llamadas a herramienta llegan partidas y hay que coserlas.** El modelo
 * no manda `{"path":"src/a.ts"}` de una: manda `{"pa`, después `th":"src/`, y
 * así. Cada trozo trae el `index` de la llamada a la que pertenece, que es lo
 * único que permite reconstruirla — el `id` y el `name` sólo vienen en el
 * primer trozo. Concatenar sin mirar el índice mezcla los argumentos de dos
 * herramientas cuando el modelo pide dos a la vez, y el resultado es un JSON
 * que parsea y dice cualquier cosa.
 *
 * Es puro por eso: es la parte del cliente donde un error no falla, produce
 * argumentos equivocados. Se testea sin red.
 *
 * Un chunk que no parsea se ignora en vez de cortar el stream: los servidores
 * mandan keep-alives y campos que no conocemos, y perder la respuesta entera
 * por uno de ésos sería peor que ignorarlo.
 *
 * @param state Lo acumulado hasta ahora.
 * @param raw El JSON del chunk, ya parseado.
 * @returns El estado nuevo. No muta el que entra.
 * @example
 * applyCompletionChunk(EMPTY_COMPLETION, { choices: [{ delta: { content: 'ho' } }] });
 */
export function applyCompletionChunk(state: CompletionState, raw: unknown): CompletionState {
  const parsed = ChunkSchema.safeParse(raw);

  if (!parsed.success) return state;

  const choice = parsed.data.choices?.[0];

  if (choice === undefined) return state;

  return {
    content: state.content + (choice.delta?.content ?? ''),
    toolCalls: mergeToolCalls(state.toolCalls, choice.delta?.tool_calls ?? []),
    finishReason: choice.finish_reason ?? state.finishReason,
  };
}

/** Un trozo de llamada, tal como llega en un chunk. */
type ToolCallDelta = NonNullable<
  NonNullable<
    NonNullable<z.infer<typeof ChunkSchema>['choices']>[number]['delta']
  >['tool_calls']
>[number];

/** Cose los trozos nuevos sobre las llamadas que ya se venían armando. */
function mergeToolCalls(
  current: readonly ToolCallRequest[],
  deltas: readonly ToolCallDelta[]
): ToolCallRequest[] {
  if (deltas.length === 0) return [...current];

  const merged = [...current];

  for (const delta of deltas) {
    const existing = merged[delta.index] ?? { id: '', name: '', arguments: '' };

    merged[delta.index] = {
      // El id y el nombre sólo vienen en el primer trozo: lo que llega después
      // es `undefined`, y pisarlos con eso perdería la llamada entera.
      id: delta.id ?? existing.id,
      name: delta.function?.name ?? existing.name,
      arguments: existing.arguments + (delta.function?.arguments ?? ''),
    };
  }

  return merged;
}

/**
 * Las llamadas que quedaron completas, descartando los huecos.
 *
 * Los huecos existen porque `index` es una posición y no un contador: si el
 * primer trozo que llega es el del índice 1, el 0 queda como un agujero del
 * array. Es raro pero pasa, y una llamada sin id ni nombre no se puede
 * ejecutar ni informar.
 *
 * @param state El estado acumulado.
 * @returns Las llamadas ejecutables, en orden.
 * @example
 * completedToolCalls(state);
 */
export function completedToolCalls(state: CompletionState): ToolCallRequest[] {
  return state.toolCalls.filter((call) => call.id !== '' && call.name !== '');
}
