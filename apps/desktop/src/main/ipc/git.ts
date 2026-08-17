import {
  CheckoutBranchRequestSchema,
  GetFileDiffRequestSchema,
  GetGitStatusRequestSchema,
  GitCommitRequestSchema,
  GitPathsRequestSchema,
  ListBranchesRequestSchema,
} from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import type { GitWatcher } from '../git/git-watcher.js';
import { startGitWatcher } from '../git/git-watcher.js';
import {
  checkoutBranch,
  commitStaged,
  fileDiffHunks,
  gitRepositoryStatus,
  listBranches,
  resetGitRepository,
  stageFiles,
  unstageFiles,
} from '../git/service.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
import { currentSettings } from '../services/settings.js';
import { registerDisposer } from '../services/shutdown.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * Cuánto se espera antes de refrescar, en milisegundos.
 *
 * El refresco es un proceso, así que se agrupa: guardar tres archivos seguidos
 * o un `git checkout` que toca miles no pueden convertirse en tres o mil
 * invocaciones de `git status`.
 */
const REFRESH_DEBOUNCE_MS = 150;

/** El watcher del `.git` del workspace abierto. Hay uno o ninguno. */
let watcher: GitWatcher | undefined;

/** El refresco agendado, si hay uno. */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** El sondeo periódico de `git.refreshIntervalMs`, si está encendido. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Agenda un refresco del estado de Git.
 *
 * Lo llaman **el watcher del workspace** —guardar un archivo lo ensucia—, el
 * watcher angosto del `.git` —un commit desde la terminal— y las operaciones
 * que cambian el índice. Nunca se llama al tipear: el estado de git no cambia
 * hasta que algo toca el disco.
 *
 * @example
 * scheduleGitRefresh();
 */
export function scheduleGitRefresh(): void {
  if (refreshTimer !== null) return;

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void broadcastStatus();
  }, REFRESH_DEBOUNCE_MS);
}

/**
 * Empieza a vigilar el `.git` del workspace recién abierto.
 *
 * @param root Raíz del workspace.
 * @example
 * startWatchingGit('C:\\proyecto');
 */
export function startWatchingGit(root: string): void {
  void stopWatchingGit();
  resetGitRepository();

  if (!currentSettings().git.enabled) return;

  watcher = startGitWatcher(root, scheduleGitRefresh);
  startPolling();
  scheduleGitRefresh();
}

/**
 * El sondeo periódico de `git.refreshIntervalMs`.
 *
 * Es una red de seguridad para filesystems donde el watcher miente —algunos
 * montajes de red no emiten eventos—, y por eso su valor por defecto es `0`,
 * que es "nunca". Un sondeo periódico contra un repositorio grande es trabajo
 * constante para nada.
 */
function startPolling(): void {
  const intervalMs = currentSettings().git.refreshIntervalMs;

  if (intervalMs <= 0) return;

  pollTimer = setInterval(scheduleGitRefresh, intervalMs);
  // Sin esto, el intervalo mantiene vivo el event loop del main y la app no
  // cierra sola cuando la última ventana se va.
  pollTimer.unref();
}

/** Corta el watcher y el sondeo, si los hay. */
async function stopWatchingGit(): Promise<void> {
  const dying = watcher;

  watcher = undefined;

  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  await dying?.close();
}

/**
 * Registra los handlers del dominio `git`.
 *
 * @example
 * registerGitIpcHandlers(); // antes de app.whenReady()
 */
export function registerGitIpcHandlers(): void {
  registerDisposer('git', () => stopWatchingGit());

  registerHandler('git:getStatus', GetGitStatusRequestSchema, async () => ({
    repository: await gitRepositoryStatus(),
  }));

  registerHandler('git:stage', GitPathsRequestSchema, async (payload) => {
    await stageFiles(payload.paths);
    // El refresco lo dispara también el watcher del `.git`, pero pedirlo acá
    // hace que el panel se actualice en el momento en vez de cuando el
    // filesystem se digne a avisar. Los dos se agrupan en el mismo debounce.
    scheduleGitRefresh();

    return {};
  });

  registerHandler('git:unstage', GitPathsRequestSchema, async (payload) => {
    await unstageFiles(payload.paths);
    scheduleGitRefresh();

    return {};
  });

  registerHandler('git:commit', GitCommitRequestSchema, async (payload) => {
    await commitStaged(payload.message);
    scheduleGitRefresh();

    return {};
  });

  registerHandler('git:listBranches', ListBranchesRequestSchema, async () => ({
    branches: await listBranches(),
  }));

  registerHandler('git:getFileDiff', GetFileDiffRequestSchema, async (payload) => ({
    // RNF-11, sin excepciones: la ruta se valida contra el workspace aunque el
    // repositorio pueda ser más grande que él.
    hunks: await fileDiffHunks(
      await resolveInsideWorkspace(payload.path, requireWorkspaceRoot())
    ),
  }));

  registerHandler('git:checkoutBranch', CheckoutBranchRequestSchema, async (payload) => {
    await checkoutBranch(payload.branch);
    scheduleGitRefresh();

    return {};
  });
}

/** Corre `git status` y manda el resultado a todas las ventanas. */
async function broadcastStatus(): Promise<void> {
  const repository = await gitRepositoryStatus().catch(() => null);

  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'git:changed', { repository });
  }
}
