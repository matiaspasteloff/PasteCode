import { join, posix, win32 } from 'node:path';

import { isInsideRoot } from '@pastecode/core';

import { assertExecutable } from '../services/executable.js';

/** Lo que hace falta para elegir el `git` que se va a lanzar. */
export interface ResolveGitOptions {
  /** `git.path` de las settings. `null` es "resolvelo vos". */
  readonly configuredPath: string | null;
  /** Dónde buscar, en orden de preferencia. Lo arma `gitSearchDirectories`. */
  readonly searchDirectories: readonly string[];
  readonly platform: NodeJS.Platform;
  /**
   * Raíz del workspace abierto.
   *
   * Se usa para **rechazar** cualquier `git` que caiga adentro: un repositorio
   * clonado puede traer un `git.exe` en su carpeta, y en Windows el directorio
   * actual llega a participar de la búsqueda de ejecutables.
   */
  readonly workspaceRoot: string | null;
}

/** Dónde quedó `git`, o por qué no hay ninguno. */
export type GitResolution = { path: string } | { problem: string };

/**
 * Los directorios donde buscar `git`, en orden de preferencia.
 *
 * **Primero los conocidos, después el `PATH`**, y ésa es toda la enmienda a
 * `seguridad.md`. Los conocidos son dónde el instalador oficial deja el binario
 * en cada sistema: rutas que no escribe nadie. El `PATH` entra al final y
 * **sólo como fuente de directorios**: no se lanza `git` por nombre dejando que
 * el sistema operativo elija en el momento de la llamada, se arma una ruta
 * absoluta con cada directorio y esa ruta se verifica como cualquier otra.
 *
 * Las rutas se arman con la gramática de `platform` y no con la del sistema que
 * corre el proceso. En producción son la misma —`platform` sale de
 * `process.platform`—, pero mezclarlas hace que la función mienta cuando se le
 * pregunta por otra: en POSIX, `C:\...` no es absoluto y `;` no separa el
 * `PATH`, así que pedirle las rutas de Windows devolvía la lista vacía.
 *
 * @param environment Normalmente `process.env`.
 * @param platform Normalmente `process.platform`.
 * @returns Los directorios absolutos a probar, en orden.
 * @example
 * gitSearchDirectories(process.env, process.platform);
 */
export function gitSearchDirectories(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string[] {
  const paths = platform === 'win32' ? win32 : posix;

  const known =
    platform === 'win32'
      ? [
          paths.join(environment.ProgramFiles ?? '', 'Git', 'cmd'),
          paths.join(environment['ProgramFiles(x86)'] ?? '', 'Git', 'cmd'),
          paths.join(environment.LOCALAPPDATA ?? '', 'Programs', 'Git', 'cmd'),
        ]
      : ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/bin'];

  const fromPath = (environment.PATH ?? environment.Path ?? '').split(paths.delimiter);

  return [...known, ...fromPath]
    .map((directory) => directory.trim())
    .filter((directory) => directory !== '' && paths.isAbsolute(directory));
}

/**
 * Resuelve `git` a una ruta absoluta, **una sola vez y para siempre**.
 *
 * `git` es una herramienta del `PATH` que no se puede empaquetar —son decenas
 * de megabytes contra el techo de RNF-05, y hay que respetar la instalación del
 * sistema porque es la que tiene las credenciales y la configuración de la
 * persona—, y `seguridad.md` prohíbe resolver ejecutables por `PATH`. La regla
 * **se enmienda, no se viola**: lo que llega a `spawn` siempre es una ruta
 * absoluta que pasó por `assertExecutable`, y se resuelve al arrancar y nunca
 * se vuelve a resolver. Ver
 * [ADR-0019](../../../../../docs/adr/0019-git-con-spawn-crudo.md).
 *
 * @param options Settings, dónde buscar, plataforma y raíz del workspace.
 * @returns La ruta absoluta, o por qué no se encontró.
 * @example
 * resolveGitExecutable({ configuredPath: null, searchDirectories, platform, workspaceRoot });
 */
export function resolveGitExecutable(options: ResolveGitOptions): GitResolution {
  const { configuredPath } = options;

  if (configuredPath !== null) return fromConfiguredPath(configuredPath, options);

  const name = options.platform === 'win32' ? 'git.exe' : 'git';

  for (const directory of options.searchDirectories) {
    const candidate = join(directory, name);

    if (isRejected(candidate, options)) continue;
    if (assertExecutable(candidate) === null) return { path: candidate };
  }

  return {
    problem:
      'No se encontró git. Instalalo, o poné la ruta absoluta de su ejecutable en "git.path".',
  };
}

/** El camino de `git.path`: lo que la persona eligió, verificado igual. */
function fromConfiguredPath(configuredPath: string, options: ResolveGitOptions): GitResolution {
  if (isRejected(configuredPath, options)) {
    return { problem: 'El git configurado está adentro del workspace y no se va a ejecutar.' };
  }

  const problem = assertExecutable(configuredPath);

  if (problem === 'not-absolute') {
    return { problem: '"git.path" tiene que ser una ruta absoluta.' };
  }

  if (problem === 'not-executable') {
    return { problem: `No se pudo ejecutar "${configuredPath}". Revisá "git.path".` };
  }

  return { path: configuredPath };
}

/** Si el candidato cae adentro del workspace, que es la única razón de rechazo. */
function isRejected(candidate: string, options: ResolveGitOptions): boolean {
  const { workspaceRoot } = options;

  return workspaceRoot !== null && isInsideRoot(workspaceRoot, candidate);
}
