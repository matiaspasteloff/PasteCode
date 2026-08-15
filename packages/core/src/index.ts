export {
  BinaryFileUnsupportedError,
  FileAccessError,
  FileTooLargeError,
  StaleFileError,
} from './errors/filesystem-errors.js';
export { PasteCodeError } from './errors/pastecode-error.js';
export { PathOutsideWorkspaceError, WorkspaceNotOpenError } from './errors/workspace-errors.js';
export { createExclusionMatcher, DEFAULT_EXCLUDES } from './workspace/exclusions.js';
export { isInsideRoot } from './workspace/is-inside-root.js';
export { flattenVisibleNodes, sortEntries } from './workspace/tree.js';
export type { DirectoryEntry, FileTreeNode, VisibleNode } from './workspace/tree.js';
export { workspaceDisplayName } from './workspace/workspace-name.js';
