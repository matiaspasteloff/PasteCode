import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveInsideWorkspace } from './path-guard.js';

/**
 * En Windows un symlink común pide privilegios de administrador o modo
 * desarrollador; un *junction* no. Como sólo enlazamos directorios, el
 * junction alcanza y el test corre igual en el runner y en una máquina
 * cualquiera. En Linux y macOS Node ignora el tipo y crea un symlink normal.
 */
async function linkDirectory(target: string, path: string): Promise<void> {
  await symlink(target, path, 'junction');
}

let sandbox: string;
let workspace: string;
let outside: string;

beforeEach(async () => {
  // `realpath` desde el arranque: en Windows el tmpdir suele venir con nombres
  // 8.3 (`RUNNER~1`) y en macOS `/var` es un symlink a `/private/var`. Sin
  // esto, las rutas esperadas del test no coinciden con las que devuelve el
  // guard y el fallo no tiene nada que ver con lo que se está probando.
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'pastecode-guard-')));
  workspace = join(sandbox, 'workspace');
  outside = join(sandbox, 'outside');

  await mkdir(join(workspace, 'src'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(workspace, 'src', 'index.ts'), 'export {};');
  await writeFile(join(outside, 'secreto.txt'), 'contraseñas');
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('resolveInsideWorkspace', () => {
  it('devuelve la ruta real de un archivo dentro del workspace', async () => {
    const resolved = await resolveInsideWorkspace(
      join(workspace, 'src', 'index.ts'),
      workspace
    );

    expect(resolved).toBe(join(workspace, 'src', 'index.ts'));
  });

  it('acepta la raíz del workspace, que es lo que lista el árbol', async () => {
    await expect(resolveInsideWorkspace(workspace, workspace)).resolves.toBe(workspace);
  });

  it('acepta un archivo que todavía no existe, porque es el caso de guardar', async () => {
    const target = join(workspace, 'src', 'nuevo.ts');

    await expect(resolveInsideWorkspace(target, workspace)).resolves.toBe(target);
  });

  it('rechaza path traversal fuera del workspace', async () => {
    const attempt = resolveInsideWorkspace(
      join(workspace, '..', 'outside', 'secreto.txt'),
      workspace
    );

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('rechaza un escape por symlink hacia una carpeta de afuera', async () => {
    await linkDirectory(outside, join(workspace, 'link'));

    const attempt = resolveInsideWorkspace(join(workspace, 'link', 'secreto.txt'), workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('rechaza un escape por symlink hacia un archivo que todavía no existe', async () => {
    // Es el agujero de la versión de seguridad.md, que ante un ENOENT devuelve
    // la ruta sin resolver: `workspace\link\nuevo.txt` parece estar adentro y
    // escribiría en `outside`.
    await linkDirectory(outside, join(workspace, 'link'));

    const attempt = resolveInsideWorkspace(join(workspace, 'link', 'nuevo.txt'), workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('acepta un symlink que apunta adentro del mismo workspace', async () => {
    await linkDirectory(join(workspace, 'src'), join(workspace, 'atajo'));

    const resolved = await resolveInsideWorkspace(
      join(workspace, 'atajo', 'index.ts'),
      workspace
    );

    expect(resolved).toBe(join(workspace, 'src', 'index.ts'));
  });

  it('resuelve el workspace aunque la raíz misma sea un symlink', async () => {
    const alias = join(sandbox, 'alias');
    await linkDirectory(workspace, alias);

    const resolved = await resolveInsideWorkspace(join(alias, 'src', 'index.ts'), alias);

    expect(resolved).toBe(join(workspace, 'src', 'index.ts'));
  });

  it('rechaza una ruta inexistente que además está afuera', async () => {
    const attempt = resolveInsideWorkspace(join(outside, 'ni', 'existe.txt'), workspace);

    await expect(attempt).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  // Sólo en Windows: en POSIX `/` siempre existe, así que el bucle de
  // `resolveDeepestReal` nunca se queda sin ancestro y esta rama es
  // inalcanzable. Una unidad que no está montada sí la alcanza.
  it.runIf(process.platform === 'win32')(
    'falla con FILE_ACCESS_DENIED cuando ni la raíz del volumen existe',
    async () => {
      const attempt = resolveInsideWorkspace('Q:\\nada\\a.ts', workspace);

      await expect(attempt).rejects.toMatchObject({ code: 'FILE_ACCESS_DENIED' });
    }
  );
});
