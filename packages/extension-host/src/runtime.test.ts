import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RpcEndpoint } from './rpc.js';
import { createExtensionRuntime } from './runtime.js';

/** Un endpoint que contesta a todo, para que las extensiones puedan registrar. */
function silentRpc(): RpcEndpoint {
  return {
    request: () => Promise.resolve(null),
    handle: () => undefined,
    receive: () => undefined,
    dispose: () => undefined,
    pendingCount: () => 0,
  };
}

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'pastecode-runtime-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** Escribe una extensión con su manifest y, si se le da, su módulo. */
async function writeExtension(
  name: string,
  manifest: Record<string, unknown>,
  source?: string
): Promise<void> {
  const root = join(sandbox, name);

  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name,
      displayName: name,
      version: '1.0.0',
      publisher: 'test',
      engines: { pastecode: '^1.0.0' },
      activationEvents: [],
      capabilities: [],
      ...manifest,
    }),
    'utf8'
  );

  // Se escribe como `.mjs` para que Node lo trate como ESM sin que la carpeta
  // necesite `"type": "module"`: acá lo que importa es que el `import()`
  // dinámico funcione, no cómo empaqueta cada extensión.
  if (source !== undefined) await writeFile(join(root, 'extension.mjs'), source, 'utf8');
}

describe('createExtensionRuntime', () => {
  it('activa una extensión que responde a onStartupFinished', async () => {
    await writeExtension(
      'saluda',
      { main: './extension.mjs', activationEvents: ['onStartupFinished'] },
      `export const activate = () => {};`
    );

    const runtime = createExtensionRuntime(silentRpc());
    const reported = await runtime.load([sandbox]);

    expect(reported).toEqual([
      {
        name: 'saluda',
        displayName: 'saluda',
        version: '1.0.0',
        state: 'active',
        capabilities: [],
      },
    ]);
  });

  it('deja inactiva a la que no responde al trigger', async () => {
    await writeExtension(
      'dormida',
      { main: './extension.mjs', activationEvents: ['onLanguage:python'] },
      `export const activate = () => {};`
    );

    const runtime = createExtensionRuntime(silentRpc());

    expect((await runtime.load([sandbox]))[0]?.state).toBe('inactive');
  });

  it('la activa cuando aparece su lenguaje', async () => {
    await writeExtension(
      'dormida',
      { main: './extension.mjs', activationEvents: ['onLanguage:python'] },
      `export const activate = () => {};`
    );

    const runtime = createExtensionRuntime(silentRpc());

    await runtime.load([sandbox]);
    await runtime.activate({ kind: 'language', languageId: 'python' });

    expect(runtime.report()[0]?.state).toBe('active');
  });

  it('una extensión sin main queda inactiva y no es un error', async () => {
    // Es la forma de un tema: contribuye sin ejecutar código, así que no hay
    // nada que activar.
    await writeExtension('tema', { activationEvents: ['onStartupFinished'] });

    const runtime = createExtensionRuntime(silentRpc());

    expect((await runtime.load([sandbox]))[0]).toMatchObject({ state: 'inactive' });
  });

  it('le pasa a activate un objeto con los dos namespaces', async () => {
    await writeExtension(
      'inspecciona',
      { main: './extension.mjs', activationEvents: ['onStartupFinished'] },
      `export const activate = (pastecode) => {
         if (typeof pastecode.commands.registerCommand !== 'function') throw new Error('sin commands');
         if (typeof pastecode.window.createStatusBarItem !== 'function') throw new Error('sin window');
       };`
    );

    const runtime = createExtensionRuntime(silentRpc());

    expect((await runtime.load([sandbox]))[0]?.state).toBe('active');
  });

  describe('RF-902: una extensión rota no toca a las demás', () => {
    it('un activate que lanza la deja failed y activa a la otra', async () => {
      await writeExtension(
        'rota',
        { main: './extension.mjs', activationEvents: ['onStartupFinished'] },
        `export const activate = () => { throw new Error('me rompí'); };`
      );
      await writeExtension(
        'sana',
        { main: './extension.mjs', activationEvents: ['onStartupFinished'] },
        `export const activate = () => {};`
      );

      const reported = await createExtensionRuntime(silentRpc()).load([sandbox]);
      const byName = new Map(reported.map((entry) => [entry.name, entry]));

      expect(byName.get('rota')?.state).toBe('failed');
      expect(byName.get('rota')?.reason).toContain('me rompí');
      expect(byName.get('sana')?.state).toBe('active');
    });

    it('un módulo sin activate es una falla y no un crash', async () => {
      await writeExtension(
        'vacia',
        { main: './extension.mjs', activationEvents: ['onStartupFinished'] },
        `export const nada = 1;`
      );

      const reported = await createExtensionRuntime(silentRpc()).load([sandbox]);

      expect(reported[0]?.state).toBe('failed');
      expect(reported[0]?.reason).toContain('activate');
    });

    it('un main que apunta a un archivo que no existe es una falla', async () => {
      await writeExtension('fantasma', {
        main: './no-existe.mjs',
        activationEvents: ['onStartupFinished'],
      });

      expect((await createExtensionRuntime(silentRpc()).load([sandbox]))[0]?.state).toBe(
        'failed'
      );
    });

    it('reporta también a las que no llegaron a tener manifest válido', async () => {
      await mkdir(join(sandbox, 'sin-manifest'), { recursive: true });

      const reported = await createExtensionRuntime(silentRpc()).load([sandbox]);

      // Desaparecer de la lista sin decir nada no es un error **visible**.
      expect(reported).toHaveLength(1);
      expect(reported[0]?.state).toBe('failed');
    });
  });

  describe('editor activo', () => {
    it('avisa a los listeners que registró una extensión', async () => {
      await writeExtension(
        'mira',
        { main: './extension.mjs', activationEvents: ['onStartupFinished'] },
        `globalThis.__vistos = [];
         export const activate = async (pastecode) => {
           await pastecode.window.onDidChangeActiveTextEditor((editor) => {
             globalThis.__vistos.push(editor?.document.path ?? null);
           });
         };`
      );

      const runtime = createExtensionRuntime(silentRpc());

      await runtime.load([sandbox]);
      runtime.setActiveEditor({ path: 'C:\\p\\a.md', languageId: 'markdown', version: 1 });
      runtime.setActiveEditor(null);

      expect(Reflect.get(globalThis, '__vistos')).toEqual(['C:\\p\\a.md', null]);
    });
  });

  it('no vuelve a activar una que ya está activa', async () => {
    await writeExtension(
      'contadora',
      { main: './extension.mjs', activationEvents: ['onStartupFinished', 'onLanguage:python'] },
      `globalThis.__activaciones = 0;
       export const activate = () => { globalThis.__activaciones += 1; };`
    );

    const runtime = createExtensionRuntime(silentRpc());

    await runtime.load([sandbox]);
    await runtime.activate({ kind: 'language', languageId: 'python' });

    // Activar dos veces sería correr `activate` dos veces sobre el mismo
    // módulo, que es exactamente el bug que los activation events causan cuando
    // no se lleva el estado.
    expect(Reflect.get(globalThis, '__activaciones')).toBe(1);
  });
});
