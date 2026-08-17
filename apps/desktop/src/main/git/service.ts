import { relative, sep } from 'node:path';

import type { DiffHunk, GitStatus } from '@pastecode/core';
import {
  buildBranchListArgs,
  buildCheckoutArgs,
  buildCommitArgs,
  buildFileDiffArgs,
  buildStageArgs,
  buildStatusArgs,
  buildToplevelArgs,
  buildUnstageArgs,
  GitUnavailableError,
  parseBranchList,
  parseDiffHunks,
  parsePorcelainV2,
  parseToplevel,
} from '@pastecode/core';
import type { GitRepository } from '@pastecode/ipc-contract';

import { currentSettings } from '../services/settings.js';
import { getWorkspace } from '../services/workspace.js';

import { gitSearchDirectories, resolveGitExecutable } from './resolve-git.js';
import { runGit } from './run.js';

/**
 * Dónde quedó `git`, resuelto **una sola vez**.
 *
 * `undefined` es "todavía no se preguntó"; `null` es "se preguntó y no hay".
 * La diferencia importa: sin ella, cada llamada volvería a recorrer el `PATH`
 * de un sistema que no tiene git instalado.
 */
let executable: string | null | undefined;

/** El último motivo por el que no hay git, para poder contarlo. */
let unavailableReason = 'git no está disponible.';

/**
 * La raíz del repositorio detectada, o `null` si el workspace no es uno.
 *
 * Es `undefined` mientras no se preguntó. La detección es **diferida**: cuesta
 * un proceso, y ponerla en el arranque gastaría parte del presupuesto de 1,5s
 * de RNF-01 en algo que nadie está mirando todavía.
 */
let repositoryRoot: string | null | undefined;

/**
 * Olvida lo detectado. Se llama al cambiar de workspace.
 *
 * El ejecutable **no** se olvida: es del sistema y no del workspace, y
 * re-resolverlo sería exactamente lo que ADR-0019 dice que no se hace.
 *
 * @example
 * resetGitRepository();
 */
export function resetGitRepository(): void {
  repositoryRoot = undefined;
}

/**
 * La ruta de `git`, resolviéndola la primera vez.
 *
 * @returns La ruta absoluta, o `null` si no hay ninguna.
 */
function gitExecutable(): string | null {
  if (executable !== undefined) return executable;

  const resolved = resolveGitExecutable({
    configuredPath: currentSettings().git.path,
    searchDirectories: gitSearchDirectories(process.env, process.platform),
    platform: process.platform,
    workspaceRoot: getWorkspace()?.root ?? null,
  });

  if ('problem' in resolved) {
    unavailableReason = resolved.problem;
    executable = null;
  } else {
    executable = resolved.path;
  }

  return executable;
}

/**
 * Si Git está activo: la settings lo permite, hay ejecutable y hay workspace.
 *
 * @returns El ejecutable y la raíz, o `null`.
 * @example
 * const active = activeGit();
 */
function activeGit(): { executable: string; cwd: string } | null {
  if (!currentSettings().git.enabled) return null;

  const cwd = getWorkspace()?.root;
  const found = gitExecutable();

  if (cwd === undefined || found === null) return null;

  return { executable: found, cwd };
}

/**
 * Igual que `activeGit`, pero lanza en vez de devolver `null`.
 *
 * Es lo que usan las operaciones que la persona pidió explícitamente —preparar,
 * commitear, cambiar de rama—: ahí el silencio es peor que el error, porque el
 * botón que se apretó no hizo nada y nadie dijo por qué.
 */
function requireGit(): { executable: string; cwd: string } {
  const active = activeGit();

  if (active === null) throw new GitUnavailableError(unavailableReason);

  return active;
}

/**
 * La raíz del repositorio del workspace, detectándola la primera vez.
 *
 * @returns La raíz, o `null` si esta carpeta no está en un repositorio.
 * @example
 * const root = await detectRepository();
 */
async function detectRepository(): Promise<string | null> {
  if (repositoryRoot !== undefined) return repositoryRoot;

  const active = activeGit();

  if (active === null) return null;

  // `rev-parse` sale con 128 cuando no es un repositorio, y eso no es un error
  // que haya que mostrar: es la respuesta.
  repositoryRoot = await runGit({ ...active, args: buildToplevelArgs() })
    .then(parseToplevel)
    .catch(() => null);

  return repositoryRoot;
}

/**
 * El estado del repositorio, listo para el contrato.
 *
 * @returns El repositorio, o `null` si no hay git, está apagado o esta carpeta
 * no es un repositorio. Los tres se ven igual desde la UI.
 * @example
 * const repository = await gitRepositoryStatus();
 */
export async function gitRepositoryStatus(): Promise<GitRepository | null> {
  const active = activeGit();
  const root = await detectRepository();

  if (active === null || root === null) return null;

  const status: GitStatus = await runGit({ ...active, args: buildStatusArgs() })
    .then(parsePorcelainV2)
    .catch(() => null)
    // Un `git status` que falla con un repositorio detectado es un repositorio
    // en un estado raro —un `index.lock` de otro proceso, casi siempre—. Se
    // devuelve lo que se sabe en vez de tirar toda la UI de Git abajo.
    .then((parsed) => parsed ?? { branch: emptyBranch(), changes: [] });

  return {
    root,
    branch: { ...status.branch },
    changes: status.changes.map((change) => ({ ...change })),
  };
}

/** La rama vacía. Se repite lo justo para no exportar una constante de core. */
function emptyBranch(): GitStatus['branch'] {
  return { name: null, upstream: null, ahead: 0, behind: 0 };
}

/**
 * Prepara archivos para el commit ([RF-602](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * @param paths Rutas relativas a la raíz del repositorio.
 * @throws {GitUnavailableError} Si no hay git.
 * @throws {GitCommandError} Si git falla.
 * @example
 * await stageFiles(['src/a.ts']);
 */
export async function stageFiles(paths: readonly string[]): Promise<void> {
  await runGit({ ...requireGit(), args: buildStageArgs(paths) });
}

/**
 * Saca archivos del índice, sin tocar el árbol de trabajo.
 *
 * @param paths Rutas relativas a la raíz del repositorio.
 * @example
 * await unstageFiles(['src/a.ts']);
 */
export async function unstageFiles(paths: readonly string[]): Promise<void> {
  await runGit({ ...requireGit(), args: buildUnstageArgs(paths) });
}

/**
 * Crea un commit con lo preparado ([RF-603](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * **Los hooks corren.** Es lo que la gente espera de un commit hecho desde un
 * IDE, y saltearlos con `--no-verify` sería tomar por ella una decisión que no
 * nos corresponde. Por eso el timeout de `runGit` es de 30 segundos.
 *
 * @param message El mensaje, tal como lo escribió la persona.
 * @example
 * await commitStaged('feat: agregar el panel');
 */
export async function commitStaged(message: string): Promise<void> {
  await runGit({ ...requireGit(), args: buildCommitArgs(message) });
}

/**
 * Las ramas locales ([RF-604](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * @returns Los nombres, en el orden en que git los listó.
 * @example
 * const branches = await listBranches();
 */
export async function listBranches(): Promise<string[]> {
  return parseBranchList(await runGit({ ...requireGit(), args: buildBranchListArgs() }));
}

/**
 * Cambia de rama.
 *
 * @param branch Nombre de la rama.
 * @example
 * await checkoutBranch('main');
 */
export async function checkoutBranch(branch: string): Promise<void> {
  await runGit({ ...requireGit(), args: buildCheckoutArgs(branch) });
}

/**
 * Los bloques cambiados de un archivo ([RF-605](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Devuelve una lista vacía —y no un error— cuando no hay git o el archivo no
 * cambió: el gutter es decoración, y hacer que una pestaña no se pueda abrir
 * porque git no está instalado sería absurdo.
 *
 * @param absolutePath Ruta absoluta, ya validada contra el workspace.
 * @returns Los bloques, en el orden en que git los escribió.
 * @example
 * const hunks = await fileDiffHunks('C:\p\src\a.ts');
 */
export async function fileDiffHunks(absolutePath: string): Promise<DiffHunk[]> {
  const active = activeGit();

  if (active === null || (await detectRepository()) === null) return [];

  // git acepta rutas relativas al `cwd`, y el `cwd` es la raíz del workspace.
  // Se normaliza el separador porque git habla con `/` en las dos plataformas.
  const relativePath = relative(active.cwd, absolutePath).split(sep).join('/');

  if (relativePath === '' || relativePath.startsWith('..')) return [];

  return runGit({ ...active, args: buildFileDiffArgs(relativePath) })
    .then(parseDiffHunks)
    .catch(() => []);
}
