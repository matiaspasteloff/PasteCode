import type { z } from 'zod';

import type { AiChannels } from './channels-ai.js';
import type { GetVersionRequestSchema, GetVersionResponseSchema } from './schemas/app.js';
import type {
  DiscardBackupsRequestSchema,
  DiscardBackupsResponseSchema,
  PendingBackupsRequestSchema,
  PendingBackupsResponseSchema,
  WriteBackupRequestSchema,
  WriteBackupResponseSchema,
} from './schemas/backups.js';
import type {
  ReadClipboardRequestSchema,
  ReadClipboardResponseSchema,
  WriteClipboardRequestSchema,
  WriteClipboardResponseSchema,
} from './schemas/clipboard.js';
import type {
  DebugStatusSchema,
  EvaluateRequestSchema,
  EvaluateResponseSchema,
  GetDebugStatusRequestSchema,
  GetLaunchConfigurationsRequestSchema,
  GetLaunchConfigurationsResponseSchema,
  GetStackTraceRequestSchema,
  GetStackTraceResponseSchema,
  GetVariablesRequestSchema,
  GetVariablesResponseSchema,
  SetBreakpointsRequestSchema,
  SetBreakpointsResponseSchema,
  StartDebugRequestSchema,
  StartDebugResponseSchema,
  StepDebugRequestSchema,
  StepDebugResponseSchema,
  StopDebugRequestSchema,
  StopDebugResponseSchema,
} from './schemas/debug.js';
import type {
  ActiveEditorChangedRequestSchema,
  ActiveEditorChangedResponseSchema,
  DocumentResponseRequestSchema,
  DocumentResponseResponseSchema,
  ExecuteExtensionCommandRequestSchema,
  ExecuteExtensionCommandResponseSchema,
  ExtensionHostStatusSchema,
  GetExtensionHostStatusRequestSchema,
  ListExtensionsRequestSchema,
  ListExtensionsResponseSchema,
} from './schemas/extensions.js';
import type { IndexFilesRequestSchema, IndexFilesResponseSchema } from './schemas/files.js';
import type {
  CreateEntryRequestSchema,
  CreateEntryResponseSchema,
  DeleteEntryRequestSchema,
  DeleteEntryResponseSchema,
  ReadDirectoryRequestSchema,
  ReadDirectoryResponseSchema,
  ReadFileRequestSchema,
  ReadFileResponseSchema,
  RenameEntryRequestSchema,
  RenameEntryResponseSchema,
  WriteFileRequestSchema,
  WriteFileResponseSchema,
} from './schemas/fs.js';
import type {
  GetFileDiffRequestSchema,
  GetFileDiffResponseSchema,
  CheckoutBranchRequestSchema,
  CheckoutBranchResponseSchema,
  GetGitStatusRequestSchema,
  GetGitStatusResponseSchema,
  GitCommitRequestSchema,
  GitCommitResponseSchema,
  GitPathsRequestSchema,
  GitPathsResponseSchema,
  ListBranchesRequestSchema,
  ListBranchesResponseSchema,
} from './schemas/git.js';
import type {
  GetKeybindingsRequestSchema,
  GetKeybindingsResponseSchema,
} from './schemas/keybindings.js';
import type {
  ChangeDocumentRequestSchema,
  ChangeDocumentResponseSchema,
  CloseDocumentRequestSchema,
  CloseDocumentResponseSchema,
  CompletionRequestSchema,
  CompletionResponseSchema,
  DefinitionRequestSchema,
  DefinitionResponseSchema,
  HoverRequestSchema,
  HoverResponseSchema,
  LspStatusRequestSchema,
  LspStatusResponseSchema,
  OpenDocumentRequestSchema,
  OpenDocumentResponseSchema,
  ResolveCompletionRequestSchema,
  ResolveCompletionResponseSchema,
} from './schemas/lsp.js';
import type {
  CancelSearchRequestSchema,
  CancelSearchResponseSchema,
  StartSearchRequestSchema,
  StartSearchResponseSchema,
} from './schemas/search.js';
import type {
  LoadSessionRequestSchema,
  LoadSessionResponseSchema,
  SaveSessionRequestSchema,
  SaveSessionResponseSchema,
} from './schemas/session.js';
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
/**
 * Los canales del asistente viven en `channels-ai.js` y se heredan, no se
 * escriben acá: es una etapa experimental que tiene que poder sacarse en un
 * borrado, y este archivo llegó al techo de 400 líneas de RNF-20. La cláusula
 * `extends` mantiene un solo `ChannelName` con todos los canales, así que un
 * canal sin handler sigue siendo un error de compilación.
 */
export interface IpcChannels extends AiChannels {
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
  'fs:createFile': {
    request: z.infer<typeof CreateEntryRequestSchema>;
    response: z.infer<typeof CreateEntryResponseSchema>;
  };
  'fs:createDirectory': {
    request: z.infer<typeof CreateEntryRequestSchema>;
    response: z.infer<typeof CreateEntryResponseSchema>;
  };
  'fs:rename': {
    request: z.infer<typeof RenameEntryRequestSchema>;
    response: z.infer<typeof RenameEntryResponseSchema>;
  };
  'fs:delete': {
    request: z.infer<typeof DeleteEntryRequestSchema>;
    response: z.infer<typeof DeleteEntryResponseSchema>;
  };
  'backups:write': {
    request: z.infer<typeof WriteBackupRequestSchema>;
    response: z.infer<typeof WriteBackupResponseSchema>;
  };
  'backups:pending': {
    request: z.infer<typeof PendingBackupsRequestSchema>;
    response: z.infer<typeof PendingBackupsResponseSchema>;
  };
  'backups:discard': {
    request: z.infer<typeof DiscardBackupsRequestSchema>;
    response: z.infer<typeof DiscardBackupsResponseSchema>;
  };
  'extensions:getStatus': {
    request: z.infer<typeof GetExtensionHostStatusRequestSchema>;
    response: z.infer<typeof ExtensionHostStatusSchema>;
  };
  'extensions:list': {
    request: z.infer<typeof ListExtensionsRequestSchema>;
    response: z.infer<typeof ListExtensionsResponseSchema>;
  };
  'debug:getConfigurations': {
    request: z.infer<typeof GetLaunchConfigurationsRequestSchema>;
    response: z.infer<typeof GetLaunchConfigurationsResponseSchema>;
  };
  'debug:getStatus': {
    request: z.infer<typeof GetDebugStatusRequestSchema>;
    response: z.infer<typeof DebugStatusSchema>;
  };
  'debug:start': {
    request: z.infer<typeof StartDebugRequestSchema>;
    response: z.infer<typeof StartDebugResponseSchema>;
  };
  'debug:stop': {
    request: z.infer<typeof StopDebugRequestSchema>;
    response: z.infer<typeof StopDebugResponseSchema>;
  };
  'debug:step': {
    request: z.infer<typeof StepDebugRequestSchema>;
    response: z.infer<typeof StepDebugResponseSchema>;
  };
  'debug:setBreakpoints': {
    request: z.infer<typeof SetBreakpointsRequestSchema>;
    response: z.infer<typeof SetBreakpointsResponseSchema>;
  };
  'debug:evaluate': {
    request: z.infer<typeof EvaluateRequestSchema>;
    response: z.infer<typeof EvaluateResponseSchema>;
  };
  'debug:getStackTrace': {
    request: z.infer<typeof GetStackTraceRequestSchema>;
    response: z.infer<typeof GetStackTraceResponseSchema>;
  };
  'debug:getVariables': {
    request: z.infer<typeof GetVariablesRequestSchema>;
    response: z.infer<typeof GetVariablesResponseSchema>;
  };
  'extensions:executeCommand': {
    request: z.infer<typeof ExecuteExtensionCommandRequestSchema>;
    response: z.infer<typeof ExecuteExtensionCommandResponseSchema>;
  };
  'extensions:documentResponse': {
    request: z.infer<typeof DocumentResponseRequestSchema>;
    response: z.infer<typeof DocumentResponseResponseSchema>;
  };
  'extensions:activeEditorChanged': {
    request: z.infer<typeof ActiveEditorChangedRequestSchema>;
    response: z.infer<typeof ActiveEditorChangedResponseSchema>;
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
  'keybindings:get': {
    request: z.infer<typeof GetKeybindingsRequestSchema>;
    response: z.infer<typeof GetKeybindingsResponseSchema>;
  };
  'settings:get': {
    request: z.infer<typeof GetSettingsRequestSchema>;
    response: z.infer<typeof GetSettingsResponseSchema>;
  };
  'settings:update': {
    request: z.infer<typeof UpdateSettingsRequestSchema>;
    response: z.infer<typeof UpdateSettingsResponseSchema>;
  };
  'session:load': {
    request: z.infer<typeof LoadSessionRequestSchema>;
    response: z.infer<typeof LoadSessionResponseSchema>;
  };
  'session:save': {
    request: z.infer<typeof SaveSessionRequestSchema>;
    response: z.infer<typeof SaveSessionResponseSchema>;
  };
  'files:index': {
    request: z.infer<typeof IndexFilesRequestSchema>;
    response: z.infer<typeof IndexFilesResponseSchema>;
  };
  'search:start': {
    request: z.infer<typeof StartSearchRequestSchema>;
    response: z.infer<typeof StartSearchResponseSchema>;
  };
  'search:cancel': {
    request: z.infer<typeof CancelSearchRequestSchema>;
    response: z.infer<typeof CancelSearchResponseSchema>;
  };
  'lsp:openDocument': {
    request: z.infer<typeof OpenDocumentRequestSchema>;
    response: z.infer<typeof OpenDocumentResponseSchema>;
  };
  'lsp:changeDocument': {
    request: z.infer<typeof ChangeDocumentRequestSchema>;
    response: z.infer<typeof ChangeDocumentResponseSchema>;
  };
  'lsp:closeDocument': {
    request: z.infer<typeof CloseDocumentRequestSchema>;
    response: z.infer<typeof CloseDocumentResponseSchema>;
  };
  'lsp:completion': {
    request: z.infer<typeof CompletionRequestSchema>;
    response: z.infer<typeof CompletionResponseSchema>;
  };
  'lsp:resolveCompletion': {
    request: z.infer<typeof ResolveCompletionRequestSchema>;
    response: z.infer<typeof ResolveCompletionResponseSchema>;
  };
  'lsp:hover': {
    request: z.infer<typeof HoverRequestSchema>;
    response: z.infer<typeof HoverResponseSchema>;
  };
  'lsp:definition': {
    request: z.infer<typeof DefinitionRequestSchema>;
    response: z.infer<typeof DefinitionResponseSchema>;
  };
  'lsp:status': {
    request: z.infer<typeof LspStatusRequestSchema>;
    response: z.infer<typeof LspStatusResponseSchema>;
  };
  'git:getStatus': {
    request: z.infer<typeof GetGitStatusRequestSchema>;
    response: z.infer<typeof GetGitStatusResponseSchema>;
  };
  'git:stage': {
    request: z.infer<typeof GitPathsRequestSchema>;
    response: z.infer<typeof GitPathsResponseSchema>;
  };
  'git:unstage': {
    request: z.infer<typeof GitPathsRequestSchema>;
    response: z.infer<typeof GitPathsResponseSchema>;
  };
  'git:commit': {
    request: z.infer<typeof GitCommitRequestSchema>;
    response: z.infer<typeof GitCommitResponseSchema>;
  };
  'git:listBranches': {
    request: z.infer<typeof ListBranchesRequestSchema>;
    response: z.infer<typeof ListBranchesResponseSchema>;
  };
  'git:checkoutBranch': {
    request: z.infer<typeof CheckoutBranchRequestSchema>;
    response: z.infer<typeof CheckoutBranchResponseSchema>;
  };
  'git:getFileDiff': {
    request: z.infer<typeof GetFileDiffRequestSchema>;
    response: z.infer<typeof GetFileDiffResponseSchema>;
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
