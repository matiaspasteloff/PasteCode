export {
  BinaryFileUnsupportedError,
  FileAccessError,
  FileTooLargeError,
  StaleFileError,
} from './errors/filesystem-errors.js';
export { PasteCodeError } from './errors/pastecode-error.js';
export { PathOutsideWorkspaceError, WorkspaceNotOpenError } from './errors/workspace-errors.js';
export { isInsideRoot } from './workspace/is-inside-root.js';
export { workspaceDisplayName } from './workspace/workspace-name.js';
