import type { z } from 'zod';

import type {
  AiChatRequestSchema,
  AiChatResponseSchema,
  AiKeyStatusRequestSchema,
  AiKeyStatusResponseSchema,
  AiToolResultRequestSchema,
  AiToolResultResponseSchema,
  CancelAiRequestSchema,
  CancelAiResponseSchema,
  ClearAiApiKeyRequestSchema,
  ClearAiApiKeyResponseSchema,
  ListAiModelsRequestSchema,
  ListAiModelsResponseSchema,
  SetAiApiKeyRequestSchema,
  SetAiApiKeyResponseSchema,
} from './schemas/ai.js';

/**
 * Los canales del asistente de IA.
 *
 * **Viven en su propio archivo y `IpcChannels` los hereda**, por dos razones
 * que apuntan en la misma dirección:
 *
 * 1. El asistente es una [etapa experimental](../../../docs/01-vision-y-alcance.md#alcance-experimental),
 *    y una de sus reglas es que se pueda sacar sin romper nada. Con el dominio
 *    en un archivo aparte, sacarlo es borrar este archivo y una cláusula
 *    `extends`; con las entradas mezcladas en el mapa grande, sería un diff
 *    quirúrgico sobre la fuente de verdad de todo el IPC.
 * 2. `channels.ts` llegó al techo de 400 líneas de
 *    [RNF-20](../../../docs/04-requerimientos-no-funcionales.md). Partir por
 *    dominio es la salida correcta; subir el umbral es la que convierte un
 *    límite en una sugerencia.
 *
 * Que sea `extends` y no un segundo mapa suelto es lo que mantiene la promesa
 * de `ChannelName`: sigue habiendo **un** tipo con todos los canales, así que
 * un canal sin handler sigue siendo un error de compilación.
 */
export interface AiChannels {
  /** Los modelos gratuitos, ya filtrados. Ver `freeModels` en `core`. */
  'ai:listModels': {
    request: z.infer<typeof ListAiModelsRequestSchema>;
    response: z.infer<typeof ListAiModelsResponseSchema>;
  };
  /** Arranca una respuesta. Devuelve `{}`: lo que importa va por evento. */
  'ai:chat': {
    request: z.infer<typeof AiChatRequestSchema>;
    response: z.infer<typeof AiChatResponseSchema>;
  };
  /** Aborta la respuesta en curso ([RF-1007](../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)). */
  'ai:cancel': {
    request: z.infer<typeof CancelAiRequestSchema>;
    response: z.infer<typeof CancelAiResponseSchema>;
  };
  /** Guarda la clave cifrada. Es el único canal por el que la clave cruza. */
  'ai:setApiKey': {
    request: z.infer<typeof SetAiApiKeyRequestSchema>;
    response: z.infer<typeof SetAiApiKeyResponseSchema>;
  };
  /** `{ hasKey, canPersist }`. **Nunca devuelve la clave.** */
  'ai:getKeyStatus': {
    request: z.infer<typeof AiKeyStatusRequestSchema>;
    response: z.infer<typeof AiKeyStatusResponseSchema>;
  };
  /** La borra del disco y de la memoria del main. */
  'ai:clearApiKey': {
    request: z.infer<typeof ClearAiApiKeyRequestSchema>;
    response: z.infer<typeof ClearAiApiKeyResponseSchema>;
  };
  /** La mitad renderer → main del pull de herramientas. Ver `ai:toolCall`. */
  'ai:toolResult': {
    request: z.infer<typeof AiToolResultRequestSchema>;
    response: z.infer<typeof AiToolResultResponseSchema>;
  };
}
