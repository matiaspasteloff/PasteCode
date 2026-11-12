import type { UpdateState } from '@pastecode/core';
import type { z } from 'zod';

import type {
  CheckForUpdateRequestSchema,
  DownloadUpdateRequestSchema,
  GetUpdateStateRequestSchema,
  InstallUpdateRequestSchema,
  OpenReleasePageRequestSchema,
  UpdateEmptyResponseSchema,
} from './schemas/update.js';

/**
 * Los canales de actualización de la app.
 *
 * En su propio archivo, como los de la ventana y los del asistente:
 * `channels.ts` está en el techo de líneas. Ver `schemas/update.ts` para la
 * regla de consentimiento que los atraviesa.
 */
export interface UpdateChannels {
  /** El estado actual, al montar. Los cambios viajan por `update:stateChanged`. */
  'update:getState': {
    request: z.infer<typeof GetUpdateStateRequestSchema>;
    response: UpdateState;
  };
  'update:check': {
    request: z.infer<typeof CheckForUpdateRequestSchema>;
    response: UpdateState;
  };
  'update:download': {
    request: z.infer<typeof DownloadUpdateRequestSchema>;
    response: UpdateState;
  };
  'update:install': {
    request: z.infer<typeof InstallUpdateRequestSchema>;
    response: z.infer<typeof UpdateEmptyResponseSchema>;
  };
  'update:openReleasePage': {
    request: z.infer<typeof OpenReleasePageRequestSchema>;
    response: z.infer<typeof UpdateEmptyResponseSchema>;
  };
}
