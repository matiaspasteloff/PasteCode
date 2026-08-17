import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gitSearchDirectories, resolveGitExecutable } from './resolve-git.js';

/** El nombre que este sistema operativo le da al ejecutable. */
const NAME = process.platform === 'win32' ? 'git.exe' : 'git';

/** Crea un ejecutable de mentira con ese nombre y devuelve su ruta. */
async function fakeGit(directory: string): Promise<string> {
  const path = join(directory, NAME);

  await mkdir(directory, { recursive: true });
  await writeFile(path, '#!/bin/sh\n');
  // En Windows el bit de ejecución no existe y `accessSync(X_OK)` sólo verifica
  // que el archivo esté; en POSIX hay que ponerlo de verdad.
  if (process.platform !== 'win32') await chmod(path, 0o755);

  return path;
}

// Estos cuatro le preguntan por una plataforma concreta, así que las
// expectativas se escriben con la gramática de esa plataforma y no con la del
// sistema que corre el test. Con `join` a secas, el caso de Windows pasaba en
// Windows y fallaba en Linux y macOS sin que la función tuviera nada malo.
describe('gitSearchDirectories', () => {
  it('pone los directorios conocidos antes que los del PATH', () => {
    const directories = gitSearchDirectories(
      { ProgramFiles: 'C:\\Archivos', PATH: 'C:\\otro' },
      'win32'
    );

    expect(directories.indexOf(win32.join('C:\\Archivos', 'Git', 'cmd'))).toBeLessThan(
      directories.indexOf('C:\\otro')
    );
  });

  it('descarta las entradas relativas del PATH', () => {
    const directories = gitSearchDirectories(
      { PATH: ['.', '..', '/usr/x'].join(posix.delimiter) },
      'linux'
    );

    expect(directories).toContain('/usr/x');
    expect(directories).not.toContain('.');
    expect(directories).not.toContain('..');
  });

  it('descarta los conocidos que quedan sin variable de entorno', () => {
    // Sin `ProgramFiles`, `join('', 'Git', 'cmd')` es relativo y no sirve para
    // construir un candidato absoluto: se cae solo por el filtro.
    expect(gitSearchDirectories({}, 'win32')).toEqual([]);
  });

  it('conoce los lugares habituales en un sistema POSIX', () => {
    expect(gitSearchDirectories({}, 'linux')).toContain('/usr/bin');
  });
});

describe('resolveGitExecutable', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pastecode-git-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('devuelve la ruta absoluta del primer directorio que lo tenga', async () => {
    const directory = join(root, 'bin');

    await fakeGit(directory);

    expect(
      resolveGitExecutable({
        configuredPath: null,
        searchDirectories: [join(root, 'vacio'), directory],
        platform: process.platform,
        workspaceRoot: null,
      })
    ).toEqual({ path: join(directory, NAME) });
  });

  it('rechaza un git que esté adentro del workspace', async () => {
    const inside = join(root, 'workspace', 'bin');

    await fakeGit(inside);

    const resolved = resolveGitExecutable({
      configuredPath: null,
      searchDirectories: [inside],
      platform: process.platform,
      workspaceRoot: join(root, 'workspace'),
    });

    // Un repositorio clonado puede traer su propio `git`, y en Windows el
    // directorio actual participa de la búsqueda más seguido de lo que parece.
    expect('problem' in resolved).toBe(true);
  });

  it('usa el git configurado si existe', async () => {
    const configured = await fakeGit(join(root, 'elegido'));

    expect(
      resolveGitExecutable({
        configuredPath: configured,
        searchDirectories: [],
        platform: process.platform,
        workspaceRoot: null,
      })
    ).toEqual({ path: configured });
  });

  it('rechaza un git.path que no sea absoluto', () => {
    const resolved = resolveGitExecutable({
      configuredPath: 'git',
      searchDirectories: [],
      platform: process.platform,
      workspaceRoot: null,
    });

    expect('problem' in resolved && resolved.problem).toContain('absoluta');
  });

  it('rechaza un git.path que no exista', () => {
    const resolved = resolveGitExecutable({
      configuredPath: join(root, 'no-existe', NAME),
      searchDirectories: [],
      platform: process.platform,
      workspaceRoot: null,
    });

    expect('problem' in resolved && resolved.problem).toContain('git.path');
  });

  it('rechaza un git.path que apunte adentro del workspace', async () => {
    const configured = await fakeGit(join(root, 'workspace', 'bin'));

    const resolved = resolveGitExecutable({
      configuredPath: configured,
      searchDirectories: [],
      platform: process.platform,
      workspaceRoot: join(root, 'workspace'),
    });

    expect('problem' in resolved && resolved.problem).toContain('workspace');
  });

  it('avisa con un mensaje accionable cuando no hay ninguno', () => {
    const resolved = resolveGitExecutable({
      configuredPath: null,
      searchDirectories: [join(root, 'vacio')],
      platform: process.platform,
      workspaceRoot: null,
    });

    expect('problem' in resolved && resolved.problem).toContain('git.path');
  });
});
