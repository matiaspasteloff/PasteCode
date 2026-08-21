import type { z } from 'zod';

import type {
  CloseWindowRequestSchema,
  CloseWindowResponseSchema,
  IsWindowMaximizedRequestSchema,
  IsWindowMaximizedResponseSchema,
  MinimizeWindowRequestSchema,
  MinimizeWindowResponseSchema,
  ToggleMaximizeWindowRequestSchema,
  ToggleMaximizeWindowResponseSchema,
} from './schemas/window.js';

/**
 * Los canales de la ventana propia.
 *
 * Viven en su propio archivo y `IpcChannels` los hereda, igual que los del
 * asistente: `channels.ts` llegó al techo de 400 líneas de RNF-20, y partir
 * por dominio es la salida correcta — subir el umbral es la que convierte un
 * límite en una sugerencia.
 *
 * Existen desde [ADR-0030](../../../docs/adr/0030-barra-de-titulo-propia.md),
 * que reemplazó el marco nativo de Windows por una barra propia. **Nada de
 * esto toca `webPreferences`**: el marco es decoración de la ventana, no un
 * permiso del renderer.
 */
export interface WindowChannels {
  'window:minimize': {
    request: z.infer<typeof MinimizeWindowRequestSchema>;
    response: z.infer<typeof MinimizeWindowResponseSchema>;
  };
  /** Maximiza o restaura, según cómo esté. Ver el schema. */
  'window:toggleMaximize': {
    request: z.infer<typeof ToggleMaximizeWindowRequestSchema>;
    response: z.infer<typeof ToggleMaximizeWindowResponseSchema>;
  };
  'window:close': {
    request: z.infer<typeof CloseWindowRequestSchema>;
    response: z.infer<typeof CloseWindowResponseSchema>;
  };
  /** El estado al montar. El hecho viaja por `window:maximizedChanged`. */
  'window:isMaximized': {
    request: z.infer<typeof IsWindowMaximizedRequestSchema>;
    response: z.infer<typeof IsWindowMaximizedResponseSchema>;
  };
}
