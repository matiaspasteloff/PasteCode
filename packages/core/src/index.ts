export { evaluateWhen, findConflicts, resolveKeybinding } from './keybindings/resolver.js';
export type { Keybinding, KeybindingConflict, WhenContext } from './keybindings/resolver.js';
export { KeybindingsFileSchema, normalizeKey, userKeybindings } from './keybindings/file.js';
export type { KeybindingsFile } from './keybindings/file.js';
export { InvalidWhenExpressionError, parseWhen } from './keybindings/when-parser.js';
export type { WhenExpression } from './keybindings/when-parser.js';
export {
  AiCancelledError,
  AiRequestError,
  EncryptionUnavailableError,
  InvalidToolCallError,
  MissingApiKeyError,
} from './errors/ai-errors.js';
export {
  applyCompletionChunk,
  completedToolCalls,
  EMPTY_COMPLETION,
} from './ai/completion-chunks.js';
export type { CompletionState, ToolCallRequest } from './ai/completion-chunks.js';
export { splitMarkdown } from './ai/markdown.js';
export type { MarkdownBlock } from './ai/markdown.js';
export {
  AI_MESSAGE_ROLES,
  AiMessageSchema,
  estimateTokens,
  trimToBudget,
} from './ai/messages.js';
export type { AiMessage, AiMessageRole } from './ai/messages.js';
export { AiModelSchema, freeModels } from './ai/models.js';
export type { AiModel } from './ai/models.js';
export { consumeSse } from './ai/sse.js';
export type { SseParseResult } from './ai/sse.js';
export {
  AI_TOOL_NAMES,
  AI_TOOLS,
  isReadOnlyTool,
  isToolName,
  parseToolArguments,
  READ_ONLY_TOOLS,
} from './ai/tools.js';
export type {
  AiToolArguments,
  AiToolDefinition,
  AiToolName,
  ReadOnlyToolName,
} from './ai/tools.js';
export { fuzzyMatch, rankByFuzzyMatch } from './commands/fuzzy.js';
export type { FuzzyMatch } from './commands/fuzzy.js';
export {
  CommandRegistry,
  DuplicateCommandError,
  UnknownCommandError,
} from './commands/registry.js';
export type { Command } from './commands/registry.js';
export {
  BinaryFileUnsupportedError,
  EntryAlreadyExistsError,
  FileAccessError,
  FileTooLargeError,
  StaleFileError,
  TrashFailedError,
} from './errors/filesystem-errors.js';
export {
  ExtensionCallTimeoutError,
  ExtensionHostUnavailableError,
} from './errors/extension-errors.js';
export {
  breakpointsIn,
  BreakpointSchema,
  pathsWithBreakpoints,
  shiftBreakpoints,
  toggleBreakpoint,
} from './debug/breakpoints.js';
export type { Breakpoint } from './debug/breakpoints.js';
export {
  LaunchConfigurationSchema,
  LaunchFileSchema,
  readLaunchFile,
} from './debug/launch-config.js';
export type {
  LaunchConfiguration,
  LaunchFile,
  LaunchFileResult,
} from './debug/launch-config.js';
export { CapabilityDeniedError } from './errors/capability-errors.js';
export { GitCommandError, GitUnavailableError } from './errors/git-errors.js';
export { PasteCodeError } from './errors/pastecode-error.js';
export {
  backoffDelay,
  decideRestart,
  DEFAULT_RESTART_POLICY,
  INITIAL_RESTART_STATE,
  noteStarted,
} from './process/restart-policy.js';
export type { RestartDecision, RestartPolicy, RestartState } from './process/restart-policy.js';
export { TerminalSpawnError, UnknownTerminalSessionError } from './errors/terminal-errors.js';
export { PathOutsideWorkspaceError, WorkspaceNotOpenError } from './errors/workspace-errors.js';
export {
  buildBranchListArgs,
  buildCheckoutArgs,
  buildCommitArgs,
  buildFileDiffArgs,
  buildStageArgs,
  buildStatusArgs,
  buildToplevelArgs,
  buildUnstageArgs,
} from './git/args.js';
export { parseDiffHunks } from './git/diff-hunks.js';
export type { DiffHunk, DiffHunkKind } from './git/diff-hunks.js';
export { parseBranchList, parsePorcelainV2, parseToplevel } from './git/porcelain.js';
export { EMPTY_GIT_STATUS } from './git/status.js';
export type { GitBranchInfo, GitFileChange, GitFileStatus, GitStatus } from './git/status.js';
export { COMPLETION_KINDS, completionKindFromLsp } from './lsp/completion-mapping.js';
export type { CompletionItemKind } from './lsp/completion-mapping.js';
export {
  DIAGNOSTIC_SEVERITIES,
  diagnosticSeverityFromLsp,
  limitDiagnostics,
} from './lsp/diagnostics.js';
export type { Diagnostic, DiagnosticSeverity, DocumentDiagnostics } from './lsp/diagnostics.js';
export {
  extensionOf,
  LANGUAGE_SERVERS,
  languageServerFor,
  languageServerForPath,
  setOption,
} from './lsp/languages.js';
export type { LanguageServerDefinition, WorkspaceModuleRequirement } from './lsp/languages.js';
export { fromLspPosition, fromLspRange, toLspPosition, toLspRange } from './lsp/positions.js';
export type {
  DocumentPosition,
  DocumentRange,
  LspPosition,
  LspRange,
} from './lsp/positions.js';
export { buildRipgrepArgs, parseRipgrepLine } from './search/ripgrep.js';
export type { SearchMatch, SearchQuery } from './search/ripgrep.js';
export { fromFileUri, planRestore, toFileUri } from './session/restore.js';
export type { RestorablePlan } from './session/restore.js';
export {
  BackupFileSchema,
  PersistedGroupSchema,
  TabStateSchema,
  WorkspaceStateSchema,
} from './session/schema.js';
export type {
  BackupFile,
  PersistedGroup,
  TabState as PersistedTabState,
  WorkspaceState,
} from './session/schema.js';
export { resolveSettings } from './settings/merge.js';
export {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  SettingsFileSchema,
  SettingsSchema,
} from './settings/schema.js';
export type { Settings, SettingsFile } from './settings/schema.js';
export { clampDimensions } from './terminal/dimensions.js';
export type { TerminalDimensions } from './terminal/dimensions.js';
export { displayNameFor, nextSessionId } from './terminal/sessions.js';
export { createExclusionMatcher, DEFAULT_EXCLUDES } from './workspace/exclusions.js';
export { FILE_ICON_KINDS, fileIconFor } from './workspace/file-icons.js';
export type { FileIconKind } from './workspace/file-icons.js';
export { rankFiles } from './workspace/file-search.js';
export type { IndexedFile } from './workspace/file-search.js';
export { isInsideRoot } from './workspace/is-inside-root.js';
export {
  activateTab,
  activeTab,
  closeTab,
  moveTab,
  NO_TABS,
  openTab,
  setTabDirty,
} from './workspace/tabs.js';
export type { TabState, TabsState } from './workspace/tabs.js';
export {
  activeGroup,
  activeTabs,
  allOpenPaths,
  closeGroup,
  EDITOR_LAYOUTS,
  focusGroup,
  groupsFromTabs,
  MAX_GROUPS,
  PRIMARY_GROUP_ID,
  SECONDARY_GROUP_ID,
  SINGLE_EMPTY_GROUPS,
  splitGroups,
  updateActiveGroup,
  updateGroup,
} from './workspace/groups.js';
export type { EditorGroup, EditorLayout, GroupsState } from './workspace/groups.js';
export { flattenVisibleNodes, sortEntries } from './workspace/tree.js';
export type { DirectoryEntry, FileTreeNode, VisibleNode } from './workspace/tree.js';
export { workspaceDisplayName } from './workspace/workspace-name.js';
