import type { z } from 'zod';

import type { GetVersionRequestSchema, GetVersionResponseSchema } from './schemas/app.js';
import type {
  ReadFileRequestSchema,
  ReadFileResponseSchema,
  WriteFileRequestSchema,
  WriteFileResponseSchema,
} from './schemas/fs.js';
import type {
  GetWorkspaceRootRequestSchema,
  GetWorkspaceRootResponseSchema,
  OpenWorkspaceRequestSchema,
  OpenWorkspaceResponseSchema,
} from './schemas/workspace.js';

/**
 * Mapa de canales de IPC. **Es la fuente de verdad**: agregar un canal empieza
 * acá y recién después toca el main, el preload y el renderer.
 *
 * El `response` de cada entrada es el valor **en caso de éxito**. El envoltorio
 * `IpcResult` lo agrega `PasteCodeApi` una sola vez, para todos los canales;
 * ver [ADR-0011](../../../docs/adr/0011-resultado-tipado-en-el-limite-de-ipc.md).
 *
 * @example
 * type V = Response<'app:getVersion'>; // { version: string }
 */
export interface IpcChannels {
  'app:getVersion': {
    request: z.infer<typeof GetVersionRequestSchema>;
    response: z.infer<typeof GetVersionResponseSchema>;
  };
  'fs:readFile': {
    request: z.infer<typeof ReadFileRequestSchema>;
    response: z.infer<typeof ReadFileResponseSchema>;
  };
  'fs:writeFile': {
    request: z.infer<typeof WriteFileRequestSchema>;
    response: z.infer<typeof WriteFileResponseSchema>;
  };
  'workspace:open': {
    request: z.infer<typeof OpenWorkspaceRequestSchema>;
    response: z.infer<typeof OpenWorkspaceResponseSchema>;
  };
  'workspace:getRoot': {
    request: z.infer<typeof GetWorkspaceRootRequestSchema>;
    response: z.infer<typeof GetWorkspaceRootResponseSchema>;
  };
}

export type ChannelName = keyof IpcChannels;
export type Request<C extends ChannelName> = IpcChannels[C]['request'];
export type Response<C extends ChannelName> = IpcChannels[C]['response'];

/**
 * Schema que valida el request de un canal.
 *
 * El alias existe para que Zod siga siendo una dependencia del contrato y no
 * se filtre a `apps/desktop`: el main registra handlers, y para eso necesita
 * nombrar el tipo de un schema, no conocer la librería que lo produce.
 *
 * @example
 * const schema: RequestSchema<'app:getVersion'> = GetVersionRequestSchema;
 */
export type RequestSchema<C extends ChannelName> = z.ZodType<Request<C>>;
