import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getWorkspace, openWorkspaceAt, requireWorkspaceRoot } from './workspace.js';

let sandbox: string;

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'pastecode-ws-')));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('el workspace abierto', () => {
  it('arranca sin ninguno', () => {
    expect(getWorkspace()).toBeNull();
  });

  it('falla con WORKSPACE_NOT_OPEN si se pide la raíz sin haber abierto nada', () => {
    expect(() => requireWorkspaceRoot()).toThrow(
      expect.objectContaining({ code: 'WORKSPACE_NOT_OPEN' })
    );
  });

  it('devuelve la carpeta y su nombre una vez abierta', async () => {
    const root = join(sandbox, 'PasteCode');
    await mkdir(root);

    const workspace = await openWorkspaceAt(root);

    expect(workspace).toEqual({ root, name: 'PasteCode' });
    expect(getWorkspace()).toEqual({ root, name: 'PasteCode' });
    expect(requireWorkspaceRoot()).toBe(root);
  });

  it('resuelve los symlinks de la raíz al abrirla', async () => {
    // Si la raíz quedara sin resolver mientras las rutas candidatas sí se
    // resuelven, un workspace abierto a través de un symlink rechazaría todos
    // sus propios archivos.
    const real = join(sandbox, 'real');
    const alias = join(sandbox, 'alias');
    await mkdir(real);
    await symlink(real, alias, 'junction');

    const workspace = await openWorkspaceAt(alias);

    expect(workspace).toEqual({ root: real, name: 'real' });
  });

  it('reemplaza el workspace anterior al abrir otra carpeta', async () => {
    const first = join(sandbox, 'primero');
    const second = join(sandbox, 'segundo');
    await mkdir(first);
    await mkdir(second);

    await openWorkspaceAt(first);
    await openWorkspaceAt(second);

    expect(requireWorkspaceRoot()).toBe(second);
  });

  it('falla con FILE_ACCESS_DENIED si la carpeta no existe', async () => {
    const attempt = openWorkspaceAt(join(sandbox, 'no-existe'));

    await expect(attempt).rejects.toMatchObject({ code: 'FILE_ACCESS_DENIED' });
  });
});
