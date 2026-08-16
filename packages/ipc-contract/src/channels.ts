import type { z } from 'zod';

import type { GetVersionRequestSchema, GetVersionResponseSchema } from './schemas/app.js';
import type {
  ReadClipboardRequestSchema,
  ReadClipboardResponseSchema,
  WriteClipboardRequestSchema,
  WriteClipboardResponseSchema,
} from './schemas/clipboard.js';
import type {
  ReadDirectoryRequestSchema,
  ReadDirectoryResponseSchema,
  ReadFileRequestSchema,
  ReadFileResponseSchema,
  WriteFileRequestSchema,
  WriteFileResponseSchema,
} from './schemas/fs.js';
import type {
  GetSettingsRequestSchema,
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
} from './schemas/settings.js';
import type {
  CreateTerminalRequestSchema,
  DisposeTerminalRequestSchema,
  DisposeTerminalResponseSchema,
  ListTerminalsRequestSchema,
  ListTerminalsResponseSchema,
  ResizeTerminalRequestSchema,
  ResizeTerminalResponseSchema,
  TerminalSessionSchema,
  WriteTerminalRequestSchema,
  WriteTerminalResponseSchema,
} from './schemas/terminal.js';
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
  'fs:readDirectory': {
    request: z.infer<typeof ReadDirectoryRequestSchema>;
    response: z.infer<typeof ReadDirectoryResponseSchema>;
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
  'terminal:create': {
    request: z.infer<typeof CreateTerminalRequestSchema>;
    response: z.infer<typeof TerminalSessionSchema>;
  };
  'terminal:write': {
    request: z.infer<typeof WriteTerminalRequestSchema>;
    response: z.infer<typeof WriteTerminalResponseSchema>;
  };
  'terminal:resize': {
    request: z.infer<typeof ResizeTerminalRequestSchema>;
    response: z.infer<typeof ResizeTerminalResponseSchema>;
  };
  'terminal:dispose': {
    request: z.infer<typeof DisposeTerminalRequestSchema>;
    response: z.infer<typeof DisposeTerminalResponseSchema>;
  };
  'terminal:list': {
    request: z.infer<typeof ListTerminalsRequestSchema>;
    response: z.infer<typeof ListTerminalsResponseSchema>;
  };
  'settings:get': {
    request: z.infer<typeof GetSettingsRequestSchema>;
    response: z.infer<typeof GetSettingsResponseSchema>;
  };
  'settings:update': {
    request: z.infer<typeof UpdateSettingsRequestSchema>;
    response: z.infer<typeof UpdateSettingsResponseSchema>;
  };
  'clipboard:readText': {
    request: z.infer<typeof ReadClipboardRequestSchema>;
    response: z.infer<typeof ReadClipboardResponseSchema>;
  };
  'clipboard:writeText': {
    request: z.infer<typeof WriteClipboardRequestSchema>;
    response: z.infer<typeof WriteClipboardResponseSchema>;
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
