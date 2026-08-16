export { evaluateWhen, findConflicts, resolveKeybinding } from './keybindings/resolver.js';
export type { Keybinding, KeybindingConflict, WhenContext } from './keybindings/resolver.js';
export { InvalidWhenExpressionError, parseWhen } from './keybindings/when-parser.js';
export type { WhenExpression } from './keybindings/when-parser.js';
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
  FileAccessError,
  FileTooLargeError,
  StaleFileError,
} from './errors/filesystem-errors.js';
export { PasteCodeError } from './errors/pastecode-error.js';
export { TerminalSpawnError, UnknownTerminalSessionError } from './errors/terminal-errors.js';
export { PathOutsideWorkspaceError, WorkspaceNotOpenError } from './errors/workspace-errors.js';
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
export { flattenVisibleNodes, sortEntries } from './workspace/tree.js';
export type { DirectoryEntry, FileTreeNode, VisibleNode } from './workspace/tree.js';
export { workspaceDisplayName } from './workspace/workspace-name.js';
