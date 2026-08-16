import { join } from 'node:path';

import { TerminalSpawnError } from '@pastecode/core';

import { assertExecutable } from './executable.js';

/** Un ejecutable y sus argumentos, ya separados. Nunca una línea de comando. */
export interface ShellCommand {
  readonly file: string;
  readonly args: readonly string[];
}

/**
 * Variables de entorno que **no** se le pasan al shell.
 *
 * Las inyecta Electron en su propio proceso y no significan nada afuera; peor
 * que eso, `ELECTRON_RUN_AS_NODE` hace que cualquier Electron que el usuario
 * lance desde esa terminal arranque como Node y no como app. Heredar el
 * entorno entero es cómodo y es exactamente cómo se filtran estas cosas.
 */
const STRIPPED_VARIABLES = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'NODE_OPTIONS',
  'NODE_ENV',
] as const;

/**
 * El shell por defecto del sistema operativo, como pide
 * [RF-301](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada).
 *
 * **Se resuelve a una ruta absoluta y nunca por PATH.** Lanzar `powershell` a
 * secas deja que gane cualquier `powershell.exe` que haya en un directorio del
 * PATH antes que el del sistema, y el PATH de un proyecto lo puede escribir un
 * repositorio clonado. Es el mismo criterio con el que
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md#procesos-hijo-y-binarios-externos)
 * resuelve ripgrep.
 *
 * En Unix se respeta `$SHELL` porque ahí el shell del usuario **es**
 * configuración del usuario, puesta en su cuenta del sistema y no en un
 * archivo del proyecto.
 *
 * @returns El ejecutable y sus argumentos.
 * @example
 * defaultShell(); // { file: 'C:\\WINDOWS\\System32\\...\\powershell.exe', args: [] }
 */
function defaultShell(): ShellCommand {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';

    return {
      file: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      // `-NoLogo` saca el banner de copyright, que ocupa tres líneas de una
      // terminal que arranca con veinticuatro.
      args: ['-NoLogo'],
    };
  }

  return { file: process.env.SHELL ?? '/bin/sh', args: [] };
}

/**
 * El shell que hay que lanzar, dado lo que digan las settings.
 *
 * `null` —el valor por defecto de `terminal.shell`— es el shell del sistema.
 * Cualquier otra cosa pasa por la allow-list de
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md#terminalshell-va-contra-una-allow-list):
 * **ruta absoluta a un archivo ejecutable que exista**. Un nombre suelto se
 * rechaza en vez de buscarse en el `PATH`, que es lo que convertiría a
 * `terminal.shell` en "ejecutá lo que encuentres primero".
 *
 * Que el valor no pueda venir de un `.pastecode/settings.json` de workspace ya
 * lo garantiza `resolveSettings`, que descarta esa clave de la capa del
 * workspace. Acá se valida lo otro: que lo que eligió el usuario exista.
 *
 * @param configured `terminal.shell` de las settings resueltas.
 * @returns El ejecutable y sus argumentos.
 * @throws {TerminalSpawnError} Si la ruta no es absoluta o no se puede ejecutar.
 * @example
 * resolveShell(null);                  // el shell del sistema
 * resolveShell('C:\\bin\\pwsh.exe');   // ése, si existe
 */
export function resolveShell(configured: string | null): ShellCommand {
  if (configured === null) return defaultShell();

  const problem = assertExecutable(configured);

  if (problem === 'not-absolute') {
    throw new TerminalSpawnError(
      configured,
      new Error('terminal.shell tiene que ser una ruta absoluta')
    );
  }

  if (problem === 'not-executable') {
    throw new TerminalSpawnError(configured, new Error('no se puede ejecutar'));
  }

  return { file: configured, args: [] };
}

/**
 * El entorno con el que arranca una terminal.
 *
 * @param source Entorno del que se parte. Normalmente `process.env`.
 * @returns Una copia sin las variables que sólo tienen sentido dentro de Electron.
 * @example
 * sanitizedEnvironment({ PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' }); // { PATH: '/usr/bin' }
 */
export function sanitizedEnvironment(
  source: NodeJS.ProcessEnv
): Record<string, string | undefined> {
  const stripped: readonly string[] = STRIPPED_VARIABLES;

  // Se filtra al construir en vez de copiar y borrar: `delete` sobre una clave
  // calculada deja el objeto en modo diccionario y, sobre todo, expresa peor
  // lo que pasa —acá no se saca nada, se elige qué entra—.
  return Object.fromEntries(
    Object.entries(source).filter(([name]) => !stripped.includes(name))
  );
}
