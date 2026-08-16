import { existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import type { LanguageServerDefinition } from '@pastecode/core';
import { setOption } from '@pastecode/core';

import { assertExecutable } from '../services/executable.js';
import { sanitizedEnvironment } from '../services/shell.js';

/** Un ejecutable absoluto, sus argumentos y su entorno. Nunca una línea de comando. */
export interface ServerLaunch {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Record<string, string | undefined>;
}

/** Por qué un servidor no se puede usar. Viaja como `userMessage` del estado `failed`. */
export interface ServerProblem {
  readonly code: string;
  readonly userMessage: string;
}

/** El resultado de resolver: cómo lanzarlo, o por qué no. */
export type ServerResolution = { launch: ServerLaunch } | { problem: ServerProblem };

/** Lo que hace falta para decidir cómo se lanza un servidor. */
export interface ResolveServerOptions {
  readonly definition: LanguageServerDefinition;
  /** `lsp.serverPaths[serverId]` de las settings. `null` es "usá el empaquetado". */
  readonly configuredPath: string | null;
  /** Desde dónde se busca el módulo empaquetado. Normalmente `app.getAppPath()`. */
  readonly appDirectory: string;
  readonly environment: NodeJS.ProcessEnv;
  /** El binario de Electron. Es el runtime de Node de los servidores empaquetados. */
  readonly execPath: string;
}

/**
 * Busca un módulo subiendo por los `node_modules` desde un directorio.
 *
 * Sube en vez de mirar un solo lugar porque los dos layouts reales son
 * distintos y los dos tienen que andar: en desarrollo pnpm está en modo
 * `hoisted` y el `node_modules` vive en la raíz del monorepo, no al lado de
 * `apps/desktop`; en el `.exe` está adentro del asar. Es la misma búsqueda que
 * hace Node al resolver un `require`, escrita a mano porque acá hace falta la
 * **ruta** del archivo y no importarlo.
 *
 * @param startDirectory Desde dónde se empieza a subir.
 * @param relativePath Ruta adentro de `node_modules`, con `/`.
 * @returns La ruta absoluta, o `null` si no está en ningún nivel.
 * @example
 * findInNodeModules(app.getAppPath(), 'typescript-language-server/lib/cli.mjs');
 */
export function findInNodeModules(startDirectory: string, relativePath: string): string | null {
  let directory = startDirectory;

  for (;;) {
    const candidate = join(directory, 'node_modules', ...relativePath.split('/'));

    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);

    if (parent === directory) return null;

    directory = parent;
  }
}

/**
 * Decide cómo se lanza el servidor de un lenguaje.
 *
 * Dos caminos, y el orden importa: **lo que diga `lsp.serverPaths` gana**, y
 * pasa por la misma allow-list que `terminal.shell` —ruta absoluta a un
 * ejecutable que existe—. Que ese valor no pueda venir del
 * `.pastecode/settings.json` de un repositorio clonado ya lo garantiza
 * `resolveSettings`, que descarta el mapa entero de la capa del workspace.
 *
 * Sin valor configurado se usa el módulo que empaquetamos, lanzado con **el
 * binario de Electron en modo Node**: así no hay un segundo runtime adentro del
 * instalador, que es lo que RNF-05 no aguanta.
 *
 * Notar la inversión deliberada en el entorno: `sanitizedEnvironment` quita
 * `ELECTRON_RUN_AS_NODE` —porque heredarlo hace que cualquier Electron que el
 * usuario lance desde su terminal arranque como Node— y acá se lo repone. Sanear
 * protege el shell de la persona; ponerlo para nuestro propio hijo es el uso
 * previsto de la variable.
 *
 * @param options Definición, settings y de dónde sale cada ruta.
 * @returns Cómo lanzarlo, o por qué no se puede.
 * @example
 * resolveServerLaunch({ definition, configuredPath: null, appDirectory, environment, execPath });
 */
export function resolveServerLaunch(options: ResolveServerOptions): ServerResolution {
  const { definition, configuredPath } = options;

  if (configuredPath !== null) return fromConfiguredPath(definition, configuredPath, options);

  if (definition.bundledModule === null) {
    return {
      problem: {
        code: 'LSP_SERVER_NOT_CONFIGURED',
        userMessage: `PasteCode no empaqueta el servidor de ${definition.serverId}. Instalalo y poné su ruta absoluta en "lsp.serverPaths.${definition.serverId}".`,
      },
    };
  }

  return fromBundledModule(definition, definition.bundledModule, options);
}

/** El camino de `lsp.serverPaths`: un ejecutable externo elegido por la persona. */
function fromConfiguredPath(
  definition: LanguageServerDefinition,
  configuredPath: string,
  options: ResolveServerOptions
): ServerResolution {
  const problem = assertExecutable(configuredPath);

  if (problem !== null) {
    return {
      problem: {
        code: 'LSP_SERVER_NOT_FOUND',
        userMessage:
          problem === 'not-absolute'
            ? `"lsp.serverPaths.${definition.serverId}" tiene que ser una ruta absoluta.`
            : `No se pudo ejecutar "${configuredPath}". Revisá "lsp.serverPaths.${definition.serverId}".`,
      },
    };
  }

  return {
    launch: {
      file: configuredPath,
      args: definition.args,
      env: sanitizedEnvironment(options.environment),
    },
  };
}

/** El camino del módulo empaquetado: el binario de Electron corriendo como Node. */
function fromBundledModule(
  definition: LanguageServerDefinition,
  bundledModule: string,
  options: ResolveServerOptions
): ServerResolution {
  const found = findInNodeModules(options.appDirectory, bundledModule);

  if (found === null) {
    return {
      problem: {
        code: 'LSP_BUNDLED_MODULE_MISSING',
        userMessage: `Falta el servidor de ${definition.serverId} que viene con PasteCode. Puede que la instalación esté incompleta.`,
      },
    };
  }

  return {
    launch: {
      file: options.execPath,
      args: [unpackedPath(found), ...definition.args],
      env: { ...sanitizedEnvironment(options.environment), ELECTRON_RUN_AS_NODE: '1' },
    },
  };
}

/**
 * Traduce una ruta de adentro del asar a la copia desempaquetada.
 *
 * Un archivo adentro del `app.asar` no lo puede leer un proceso que no sea
 * Electron, y el servidor de lenguaje es un Node aparte. Es exactamente el
 * mismo problema que `ripgrepPath` resuelve para el binario de `rg`, con la
 * misma solución del lado de `electron-builder` (`asarUnpack`).
 */
function unpackedPath(path: string): string {
  return path.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}

/**
 * Arma las `initializationOptions`, resolviendo los módulos del workspace.
 *
 * Es lo que hace que `typescript-language-server` use el `tsserver` **del
 * proyecto** y no uno nuestro. Sin el módulo, el servidor no arranca y se lo
 * dice: tipar un proyecto con una versión de TypeScript distinta a la que
 * apunta su `tsconfig` produce errores que no existen, que es peor que no tener
 * diagnósticos.
 *
 * @param definition La definición del servidor.
 * @param root Raíz del workspace abierto.
 * @returns Las opciones, o por qué falta algo.
 * @example
 * resolveInitializationOptions(definition, 'C:\\proyecto');
 */
export function resolveInitializationOptions(
  definition: LanguageServerDefinition,
  root: string
): { options: Record<string, unknown> } | { problem: ServerProblem } {
  let options: Record<string, unknown> = { ...definition.initializationOptions };

  for (const requirement of definition.workspaceModules) {
    const resolved = join(root, 'node_modules', ...requirement.modulePath.split('/'));

    if (!existsSync(resolved)) {
      return {
        problem: {
          code: 'LSP_WORKSPACE_MODULE_MISSING',
          userMessage: `El servidor de ${definition.serverId} necesita "${requirement.packageName}" instalado en el workspace. Corré la instalación de dependencias del proyecto.`,
        },
      };
    }

    options = setOption(options, requirement.option, resolved);
  }

  return { options };
}
