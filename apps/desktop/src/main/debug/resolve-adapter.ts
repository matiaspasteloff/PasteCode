import { extname } from 'node:path';

import type { Settings } from '@pastecode/core';

import { assertExecutable } from '../services/executable.js';
import { sanitizedEnvironment } from '../services/shell.js';

/** Cómo lanzar el adaptador: ejecutable absoluto, argumentos y entorno. */
export interface AdapterLaunch {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Record<string, string | undefined>;
}

/**
 * Por qué no se puede debuggear. Viaja como `userMessage` del estado apagado.
 *
 * No se exporta por nombre: se lo consume a través de `AdapterResolution`, que
 * es la unión que sí se exporta. Nombrarlo igual es lo que hace legible la
 * firma en vez de tener un objeto anónimo adentro de la unión.
 */
interface AdapterProblem {
  readonly code: string;
  readonly userMessage: string;
}

/** Cómo lanzarlo, o por qué no. */
export type AdapterResolution = { launch: AdapterLaunch } | { problem: AdapterProblem };

/**
 * Decide cómo lanzar el adaptador de debug, o por qué no se puede.
 *
 * **No viene ninguno empaquetado.** Es la misma decisión que con `ripgrep` y los
 * servidores de lenguaje: un adaptador es un ejecutable de terceros con su
 * propio ciclo de release, y meterlo en el instalador lo ataría a nuestro
 * calendario y a [RNF-05](../../../../../docs/04-requerimientos-no-funcionales.md).
 * Sin adaptador configurado el debugging queda apagado con un mensaje
 * accionable y el resto del IDE intacto, igual que hoy sin `pyright` instalado.
 *
 * **La ruta sale de `debug.adapterPath` del usuario y nunca del workspace.**
 * Esa regla la hace cumplir `resolveSettings` en `packages/core`, y no se
 * verifica de nuevo acá: duplicar la comprobación dejaría dos lugares donde
 * arreglarla el día que cambie. Ver
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md#procesos-hijo-y-binarios-externos).
 *
 * Un `.js` se lanza con el propio Electron como runtime de Node —el mismo truco
 * que ya usan los servidores empaquetados— porque los adaptadores del
 * ecosistema de JavaScript se distribuyen como scripts y no como binarios.
 *
 * @param settings Las settings ya resueltas.
 * @param execPath El binario de Electron, que hace de Node.
 * @param environment El entorno del proceso, para sanearlo.
 * @returns Cómo lanzarlo, o el problema que lo impide.
 * @example
 * const resolved = resolveAdapter(settings, process.execPath, process.env);
 */
export function resolveAdapter(
  settings: Settings,
  execPath: string,
  environment: NodeJS.ProcessEnv
): AdapterResolution {
  const configured = settings.debug.adapterPath;

  if (configured === null) {
    return {
      problem: {
        code: 'DEBUG_ADAPTER_NOT_CONFIGURED',
        userMessage:
          'No hay ningún adaptador de debug configurado. Poné la ruta en "debug.adapterPath" de tu settings.json para poder depurar.',
      },
    };
  }

  const failure = assertExecutable(configured);

  if (failure === 'not-absolute') {
    return {
      problem: {
        code: 'DEBUG_ADAPTER_NOT_ABSOLUTE',
        userMessage: `La ruta del adaptador de debug tiene que ser absoluta. "${configured}" no lo es.`,
      },
    };
  }

  if (failure === 'not-executable') {
    return {
      problem: {
        code: 'DEBUG_ADAPTER_NOT_FOUND',
        userMessage: `No se encontró el adaptador de debug en "${configured}". Revisá la ruta de "debug.adapterPath".`,
      },
    };
  }

  return { launch: launchFor(configured, settings.debug.adapterArgs, execPath, environment) };
}

/** Arma el lanzamiento, eligiendo runtime según la extensión. */
function launchFor(
  adapterPath: string,
  extraArgs: readonly string[],
  execPath: string,
  environment: NodeJS.ProcessEnv
): AdapterLaunch {
  const env = sanitizedEnvironment(environment);

  // Un `.js` no se ejecuta solo: necesita un Node. Se usa el propio Electron
  // con `ELECTRON_RUN_AS_NODE`, que es lo que ya hace el LSP con los servidores
  // empaquetados, y lo que evita depender de que haya un Node en el PATH.
  if (extname(adapterPath).toLowerCase() === '.js') {
    return {
      file: execPath,
      args: [adapterPath, ...extraArgs],
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  return { file: adapterPath, args: [...extraArgs], env };
}
