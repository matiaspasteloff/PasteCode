import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Settings } from '@pastecode/core';
import { DEFAULT_SETTINGS } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import { makeTempDirectory, removeTempDirectory } from '../test-support/temp-directory.js';

import type { AdapterLaunch } from './resolve-adapter.js';
import { resolveAdapter } from './resolve-adapter.js';

/** Las settings por omisión con el bloque de debug que se le pase. */
function settingsWith(debug: Partial<Settings['debug']>): Settings {
  return { ...DEFAULT_SETTINGS, debug: { ...DEFAULT_SETTINGS.debug, ...debug } };
}

/** Un ejecutable que sí existe en cualquier máquina que corra estos tests. */
const REAL_EXECUTABLE = process.execPath;

/** Resuelve y exige que haya salido bien. Falla con un mensaje útil si no. */
function launchOf(settings: Settings, environment: NodeJS.ProcessEnv = {}): AdapterLaunch {
  const resolved = resolveAdapter(settings, REAL_EXECUTABLE, environment);

  if (!('launch' in resolved)) throw new Error(`No resolvió: ${resolved.problem.code}`);

  return resolved.launch;
}

/** El problema de una resolución que tenía que fallar. */
function problemOf(settings: Settings): { code: string; userMessage: string } {
  const resolved = resolveAdapter(settings, REAL_EXECUTABLE, {});

  if ('launch' in resolved) throw new Error('Tenía que fallar y resolvió');

  return resolved.problem;
}

describe('resolveAdapter', () => {
  describe('sin adaptador configurado', () => {
    it('no es un error: es un estado, con un mensaje accionable', () => {
      const problem = problemOf(settingsWith({ adapterPath: null }));

      expect(problem.code).toBe('DEBUG_ADAPTER_NOT_CONFIGURED');
      // El mensaje nombra la clave que hay que tocar: quien lo lee tiene que
      // poder arreglarlo sin abrir la documentación.
      expect(problem.userMessage).toContain('debug.adapterPath');
    });
  });

  describe('rutas que no se aceptan', () => {
    it('rechaza una ruta relativa', () => {
      // Una ruta relativa se resolvería contra el `cwd`, que no es un lugar
      // sobre el que nadie tenga control. Misma regla que `lsp.serverPaths`.
      expect(problemOf(settingsWith({ adapterPath: 'dap.js' })).code).toBe(
        'DEBUG_ADAPTER_NOT_ABSOLUTE'
      );
    });

    it('rechaza una ruta absoluta que no existe', () => {
      const missing = join(process.cwd(), 'no', 'existe', 'dap.js');

      expect(problemOf(settingsWith({ adapterPath: missing })).code).toBe(
        'DEBUG_ADAPTER_NOT_FOUND'
      );
    });
  });

  describe('cuando la ruta sirve', () => {
    it('lanza un binario directamente', () => {
      expect(launchOf(settingsWith({ adapterPath: REAL_EXECUTABLE }))).toMatchObject({
        file: REAL_EXECUTABLE,
        args: [],
      });
    });

    it('le pasa los argumentos configurados', () => {
      const launch = launchOf(
        settingsWith({ adapterPath: REAL_EXECUTABLE, adapterArgs: ['--server=4711'] })
      );

      expect(launch.args).toEqual(['--server=4711']);
    });

    it('saca del entorno lo que el saneador saca', () => {
      const launch = launchOf(settingsWith({ adapterPath: REAL_EXECUTABLE }), {
        NODE_OPTIONS: '--require /algo/feo.js',
        PASTECODE_MARCA: 'sigo',
      });

      // `NODE_OPTIONS` es ejecución de código arbitrario heredada por cada
      // proceso hijo. El saneador lo saca de raíz: la clave no queda en
      // `undefined`, no queda. Acá se verifica que se lo use.
      expect(launch.env).not.toHaveProperty('NODE_OPTIONS');
      expect(launch.env).toMatchObject({ PASTECODE_MARCA: 'sigo' });
    });
  });

  describe('un adaptador que es un .js', () => {
    it('se lanza con el propio Electron como runtime de Node', async () => {
      // Los adaptadores del ecosistema de JavaScript se distribuyen como
      // scripts, no como binarios. Usar el Electron propio evita depender de
      // que haya un Node en el PATH, que es el mismo truco que ya usa el LSP.
      const sandbox = await makeTempDirectory('pastecode-dap-');
      const script = join(sandbox, 'dapDebugServer.js');

      await writeFile(script, '// un adaptador de mentira', 'utf8');

      const launch = launchOf(settingsWith({ adapterPath: script, adapterArgs: ['4711'] }));

      expect(launch.file).toBe(REAL_EXECUTABLE);
      // El script va como **primer argumento**, no como ejecutable.
      expect(launch.args).toEqual([script, '4711']);
      expect(launch.env).toMatchObject({ ELECTRON_RUN_AS_NODE: '1' });

      await removeTempDirectory(sandbox);
    });

    it('un binario se lanza tal cual, sin runtime prestado', async () => {
      const sandbox = await makeTempDirectory('pastecode-dap-');
      const binary = join(sandbox, 'adapter.exe');

      await writeFile(binary, '', 'utf8');

      const launch = launchOf(settingsWith({ adapterPath: binary }));

      expect(launch.file).toBe(binary);
      expect(launch.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');

      await removeTempDirectory(sandbox);
    });
  });
});
