import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { TerminalSpawnError } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveShell, sanitizedEnvironment } from './shell.js';

let root: string;

/** Crea un ejecutable de mentira y devuelve su ruta absoluta. */
async function fakeExecutable(name: string): Promise<string> {
  const path = join(root, name);

  await writeFile(path, '#!/bin/sh\n');
  // En Windows el bit de ejecución no existe y `accessSync(X_OK)` sólo verifica
  // que el archivo esté; en POSIX hay que ponerlo de verdad.
  if (process.platform !== 'win32') await chmod(path, 0o755);

  return path;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pastecode-shell-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('resolveShell', () => {
  it('cae al shell del sistema, con ruta absoluta, cuando no hay nada configurado', () => {
    const shell = resolveShell(null);

    // Lo que importa no es cuál es —depende del sistema operativo— sino que sea
    // absoluto: lanzar `powershell` a secas deja que gane cualquiera que esté
    // antes en el PATH, y el PATH de un proyecto lo puede escribir un
    // repositorio clonado.
    expect(isAbsolute(shell.file)).toBe(true);
  });

  it('usa el shell configurado si existe', async () => {
    const configured = await fakeExecutable('pwsh');

    expect(resolveShell(configured)).toEqual({ file: configured, args: [] });
  });

  it('rechaza un shell que no sea una ruta absoluta', () => {
    // Un nombre suelto convertiría `terminal.shell` en "ejecutá lo que
    // encuentres primero".
    expect(() => resolveShell('powershell')).toThrow(TerminalSpawnError);
  });

  it('rechaza un shell que no exista', () => {
    expect(() => resolveShell(join(root, 'no-existe'))).toThrow(TerminalSpawnError);
  });
});

describe('sanitizedEnvironment', () => {
  it('saca las variables que inyecta Electron', () => {
    // `ELECTRON_RUN_AS_NODE` heredado hace que cualquier Electron que se lance
    // desde esa terminal arranque como Node y no como app.
    const environment = sanitizedEnvironment({
      PATH: '/usr/bin',
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      NODE_OPTIONS: '--inspect',
      NODE_ENV: 'production',
    });

    expect(environment).toEqual({ PATH: '/usr/bin' });
  });

  it('no toca el entorno que recibe', () => {
    const source = { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' };

    sanitizedEnvironment(source);

    expect(source.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('deja pasar un entorno que no tiene nada que sacar', () => {
    expect(sanitizedEnvironment({ PATH: '/usr/bin', HOME: '/home/x' })).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/x',
    });
  });
});
