export type { PasteCodeApi } from './api.js';
export type { ChannelName, IpcChannels, Request, RequestSchema, Response } from './channels.js';
export { EVENT_NAMES, isEventName } from './events.js';
export type {
  EventName,
  EventPayload,
  ExtensionHostChangedEvent,
  ExtensionContributionsEvent,
  ExtensionDocumentRequestEvent,
  ExtensionsChangedEvent,
  FileChangePayload,
  FilesChangedEvent,
  GitChangedEvent,
  IpcEvents,
  LspDiagnosticsEvent,
  LspServerChangedEvent,
  SearchDoneEvent,
  SearchResultEvent,
  KeybindingsChangedEvent,
  SettingsChangedEvent,
  TerminalDataEvent,
  TerminalExitEvent,
} from './events.js';
export {
  ActiveEditorChangedRequestSchema,
  DocumentResponseRequestSchema,
  ExecuteExtensionCommandRequestSchema,
  ExtensionCommandSchema,
  ExtensionContributionsSchema,
  ExtensionStatusItemSchema,
  ExtensionTextEditSchema,
  ExtensionHostStatusSchema,
  ExtensionInfoSchema,
  ExtensionStateSchema,
  GetExtensionHostStatusRequestSchema,
  HostStateSchema,
  ListExtensionsRequestSchema,
  ListExtensionsResponseSchema,
} from './schemas/extensions.js';
export {
  DIFF_HUNK_KINDS,
  DiffHunkSchema,
  GetFileDiffRequestSchema,
  GetFileDiffResponseSchema,
  CheckoutBranchRequestSchema,
  CheckoutBranchResponseSchema,
  GetGitStatusRequestSchema,
  GetGitStatusResponseSchema,
  GIT_FILE_STATUSES,
  GitBranchInfoSchema,
  GitCommitRequestSchema,
  GitCommitResponseSchema,
  GitFileChangeSchema,
  GitPathsRequestSchema,
  GitPathsResponseSchema,
  GitRepositorySchema,
  ListBranchesRequestSchema,
  ListBranchesResponseSchema,
} from './schemas/git.js';
export type { GitRepository } from './schemas/git.js';
export {
  ChangeDocumentRequestSchema,
  ChangeDocumentResponseSchema,
  CloseDocumentRequestSchema,
  CloseDocumentResponseSchema,
  CompletionItemSchema,
  CompletionRequestSchema,
  CompletionResponseSchema,
  DefinitionLocationSchema,
  DefinitionRequestSchema,
  DefinitionResponseSchema,
  DocumentChangeSchema,
  DocumentPositionSchema,
  DocumentRangeSchema,
  HoverRequestSchema,
  HoverResponseSchema,
  LSP_SERVER_STATES,
  LspServerStatusSchema,
  LspStatusRequestSchema,
  LspStatusResponseSchema,
  OpenDocumentRequestSchema,
  OpenDocumentResponseSchema,
  ResolveCompletionRequestSchema,
  ResolveCompletionResponseSchema,
} from './schemas/lsp.js';
export type {
  CompletionItem,
  DefinitionLocation,
  DocumentChange,
  LspServerStatus,
} from './schemas/lsp.js';
export {
  IndexedFileSchema,
  IndexFilesRequestSchema,
  IndexFilesResponseSchema,
} from './schemas/files.js';
export {
  CancelSearchRequestSchema,
  CancelSearchResponseSchema,
  StartSearchRequestSchema,
  StartSearchResponseSchema,
} from './schemas/search.js';
export {
  LoadSessionRequestSchema,
  LoadSessionResponseSchema,
  SaveSessionRequestSchema,
  SaveSessionResponseSchema,
} from './schemas/session.js';
export {
  GetSettingsRequestSchema,
  GetSettingsResponseSchema,
  UpdateSettingsRequestSchema,
  UpdateSettingsResponseSchema,
} from './schemas/settings.js';
export type { IpcResult, SerializedError } from './result.js';
export { GetVersionRequestSchema, GetVersionResponseSchema } from './schemas/app.js';
export {
  ReadClipboardRequestSchema,
  ReadClipboardResponseSchema,
  WriteClipboardRequestSchema,
  WriteClipboardResponseSchema,
} from './schemas/clipboard.js';
export {
  GetKeybindingsRequestSchema,
  GetKeybindingsResponseSchema,
  KeybindingConflictSchema,
  KeybindingSchema,
} from './schemas/keybindings.js';
export {
  DiscardBackupsRequestSchema,
  DiscardBackupsResponseSchema,
  PendingBackupsRequestSchema,
  PendingBackupsResponseSchema,
  RecoverableBackupSchema,
  WriteBackupRequestSchema,
  WriteBackupResponseSchema,
} from './schemas/backups.js';
export {
  CreateEntryRequestSchema,
  CreateEntryResponseSchema,
  DeleteEntryRequestSchema,
  DeleteEntryResponseSchema,
  DirectoryEntrySchema,
  ReadDirectoryRequestSchema,
  ReadDirectoryResponseSchema,
  ReadFileRequestSchema,
  ReadFileResponseSchema,
  RenameEntryRequestSchema,
  RenameEntryResponseSchema,
  WriteFileRequestSchema,
  WriteFileResponseSchema,
} from './schemas/fs.js';
export {
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
export type { TerminalSession } from './schemas/terminal.js';
export {
  GetWorkspaceRootRequestSchema,
  GetWorkspaceRootResponseSchema,
  OpenWorkspaceRequestSchema,
  OpenWorkspaceResponseSchema,
  WorkspaceInfoSchema,
} from './schemas/workspace.js';
export type { WorkspaceInfo } from './schemas/workspace.js';
