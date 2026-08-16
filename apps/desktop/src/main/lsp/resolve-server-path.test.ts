import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LanguageServerDefinition } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findInNodeModules,
  resolveInitializationOptions,
  resolveServerLaunch,
} from './resolve-server-path.js';

/** Una definición con módulo empaquetado, como la de TypeScript. */
const BUNDLED: LanguageServerDefinition = {
  serverId: 'typescript',
  languageIds: ['typescript'],
  extensions: ['.ts'],
  args: ['--stdio'],
  rootMarkers: ['tsconfig.json'],
  bundledModule: 'fake-server/cli.mjs',
  workspaceModules: [
    { option: ['tsserver', 'path'], modulePath: 'typescript/lib', packageName: 'typescript' },
  ],
  initializationOptions: {},
};

/** Una definición sin módulo empaquetado, como la de Rust. */
const EXTERNAL: LanguageServerDefinition = {
  ...BUNDLED,
  serverId: 'rust',
  bundledModule: null,
  workspaceModules: [],
};

const ENVIRONMENT = { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1', HOME: '/home/x' };

describe('findInNodeModules', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pastecode-modules-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('encuentra el módulo en el directorio de partida', async () => {
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'x', 'cli.mjs'), '');

    expect(findInNodeModules(root, 'x/cli.mjs')).toBe(
      join(root, 'node_modules', 'x', 'cli.mjs')
    );
  });

  it('sube hasta encontrarlo, que es el layout hoisted de pnpm', async () => {
    const nested = join(root, 'apps', 'desktop');

    await mkdir(nested, { recursive: true });
    await mkdir(join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'x', 'cli.mjs'), '');

    expect(findInNodeModules(nested, 'x/cli.mjs')).toBe(
      join(root, 'node_modules', 'x', 'cli.mjs')
    );
  });

  it('devuelve null cuando no está en ningún nivel', () => {
    expect(findInNodeModules(root, 'no-existe/cli.mjs')).toBeNull();
  });
});

describe('resolveServerLaunch', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pastecode-launch-'));
    await mkdir(join(root, 'node_modules', 'fake-server'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'fake-server', 'cli.mjs'), '');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lanza el módulo empaquetado con el binario de Electron en modo Node', () => {
    const resolved = resolveServerLaunch({
      definition: BUNDLED,
      configuredPath: null,
      appDirectory: root,
      environment: ENVIRONMENT,
      execPath: '/apps/electron',
    });

    expect(resolved).toEqual({
      launch: {
        file: '/apps/electron',
        args: [join(root, 'node_modules', 'fake-server', 'cli.mjs'), '--stdio'],
        env: { PATH: '/usr/bin', HOME: '/home/x', ELECTRON_RUN_AS_NODE: '1' },
      },
    });
  });

  it('repone ELECTRON_RUN_AS_NODE después de sanear, y sólo para nuestro hijo', () => {
    const bundled = resolveServerLaunch({
      definition: BUNDLED,
      configuredPath: null,
      appDirectory: root,
      environment: ENVIRONMENT,
      execPath: '/apps/electron',
    });
    const external = resolveServerLaunch({
      definition: EXTERNAL,
      configuredPath: 'no-absoluta',
      appDirectory: root,
      environment: ENVIRONMENT,
      execPath: '/apps/electron',
    });

    expect('launch' in bundled && bundled.launch.env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect('problem' in external).toBe(true);
  });

  it('rechaza una ruta configurada que no es absoluta', () => {
    const resolved = resolveServerLaunch({
      definition: EXTERNAL,
      configuredPath: 'rust-analyzer',
      appDirectory: root,
      environment: ENVIRONMENT,
      execPath: '/apps/electron',
    });

    expect('problem' in resolved && resolved.problem.code).toBe('LSP_SERVER_NOT_FOUND');
  });

  it('rechaza un servidor externo sin ruta configurada', () => {
    const resolved = resolveServerLaunch({
      definition: EXTERNAL,
      configuredPath: null,
      appDirectory: root,
      environment: ENVIRONMENT,
      execPath: '/apps/electron',
    });

    expect('problem' in resolved && resolved.problem.code).toBe('LSP_SERVER_NOT_CONFIGURED');
  });

  it('avisa cuando falta el módulo que empaquetamos', () => {
    const resolved = resolveServerLaunch({
      definition: { ...BUNDLED, bundledModule: 'no-existe/cli.mjs' },
      configuredPath: null,
      appDirectory: root,
      environment: ENVIRONMENT,
      execPath: '/apps/electron',
    });

    expect('problem' in resolved && resolved.problem.code).toBe('LSP_BUNDLED_MODULE_MISSING');
  });
});

describe('resolveInitializationOptions', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pastecode-options-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('escribe la ruta del módulo del workspace en la opción que pide la tabla', async () => {
    await mkdir(join(root, 'node_modules', 'typescript', 'lib'), { recursive: true });

    expect(resolveInitializationOptions(BUNDLED, root)).toEqual({
      options: { tsserver: { path: join(root, 'node_modules', 'typescript', 'lib') } },
    });
  });

  it('avisa cuando el workspace no tiene el paquete', () => {
    const resolved = resolveInitializationOptions(BUNDLED, root);

    expect('problem' in resolved && resolved.problem.code).toBe('LSP_WORKSPACE_MODULE_MISSING');
  });

  it('deja las opciones estáticas intactas cuando no hay módulos que resolver', () => {
    expect(
      resolveInitializationOptions(
        { ...EXTERNAL, initializationOptions: { cargo: { allFeatures: true } } },
        root
      )
    ).toEqual({ options: { cargo: { allFeatures: true } } });
  });
});
