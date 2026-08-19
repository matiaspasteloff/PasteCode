import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanExtensions } from './scan.js';

/** Un manifest mínimo y válido, para variarlo en cada caso. */
function validManifest(name: string): Record<string, unknown> {
  return {
    name,
    displayName: name,
    version: '1.0.0',
    publisher: 'pastecode',
    engines: { pastecode: '^1.0.0' },
    activationEvents: ['onStartupFinished'],
    capabilities: [],
  };
}

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'pastecode-scan-'));
});

afterEach(async () => {
  // `maxRetries` y no un `rm` pelado: en Windows el antivirus y el indexador
  // sostienen handles unos milisegundos después de cerrar, y sin reintentos eso
  // aparece como un `EBUSY` intermitente que no tiene nada que ver con el test.
  await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** Escribe una carpeta de extensión con el package.json que se le dé. */
async function writeExtension(
  directory: string,
  name: string,
  manifest: unknown
): Promise<string> {
  const root = join(directory, name);

  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest), 'utf8');

  return root;
}

describe('scanExtensions', () => {
  it('encuentra una extensión con manifest válido', async () => {
    await writeExtension(sandbox, 'word-count', validManifest('word-count'));

    const result = await scanExtensions([sandbox]);

    expect(result.failures).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0]?.manifest.name).toBe('word-count');
  });

  it('no se cae con un directorio que no existe', async () => {
    // `~/.pastecode/extensions/` no existe hasta la primera instalación, y ése
    // es el estado normal de una instalación recién hecha.
    const result = await scanExtensions([join(sandbox, 'no-existe')]);

    expect(result).toEqual({ extensions: [], failures: [] });
  });

  describe('RF-902: un manifest roto no tumba nada', () => {
    it('anota la falla y sigue con las demás', async () => {
      await writeExtension(sandbox, 'rota', { name: 'rota' });
      await writeExtension(sandbox, 'sana', validManifest('sana'));

      const result = await scanExtensions([sandbox]);

      expect(result.extensions.map((found) => found.manifest.name)).toEqual(['sana']);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.reason).toContain('Manifest inválido');
    });

    it('reporta un package.json que no es JSON', async () => {
      const root = join(sandbox, 'basura');

      await mkdir(root, { recursive: true });
      await writeFile(join(root, 'package.json'), '{ esto no es json', 'utf8');

      const result = await scanExtensions([sandbox]);

      expect(result.extensions).toEqual([]);
      expect(result.failures[0]?.reason).toContain('no es JSON válido');
    });

    it('reporta una carpeta sin package.json', async () => {
      await mkdir(join(sandbox, 'vacia'), { recursive: true });

      const result = await scanExtensions([sandbox]);

      expect(result.failures[0]?.reason).toBe('No tiene package.json');
    });

    it('rechaza un activation event que no está en el alcance', async () => {
      // `onDebug:` existe en VS Code y no acá. Aceptarlo sería prometer una
      // activación que nunca va a ocurrir.
      await writeExtension(sandbox, 'futura', {
        ...validManifest('futura'),
        activationEvents: ['onDebug:node'],
      });

      const result = await scanExtensions([sandbox]);

      expect(result.extensions).toEqual([]);
      expect(result.failures).toHaveLength(1);
    });

    it('rechaza una capability inventada', async () => {
      await writeExtension(sandbox, 'ambiciosa', {
        ...validManifest('ambiciosa'),
        capabilities: ['filesystem'],
      });

      expect((await scanExtensions([sandbox])).extensions).toEqual([]);
    });
  });

  describe('precedencia entre directorios', () => {
    it('la del usuario pisa a la empaquetada con el mismo nombre', async () => {
      const bundled = join(sandbox, 'bundled');
      const user = join(sandbox, 'user');

      await writeExtension(bundled, 'word-count', {
        ...validManifest('word-count'),
        version: '1.0.0',
      });
      await writeExtension(user, 'word-count', {
        ...validManifest('word-count'),
        version: '2.0.0',
      });

      const result = await scanExtensions([bundled, user]);

      // Es lo que permite probar una versión propia sin desinstalar nada.
      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0]?.manifest.version).toBe('2.0.0');
    });
  });

  it('acepta las claves de más que npm le pone a cualquier package.json', async () => {
    // El manifest **es** el package.json: trae scripts y devDependencies. Un
    // schema estricto haría que ninguna extensión real cargara nunca.
    await writeExtension(sandbox, 'real', {
      ...validManifest('real'),
      scripts: { build: 'tsc' },
      devDependencies: { typescript: '6.0.3' },
    });

    expect((await scanExtensions([sandbox])).extensions).toHaveLength(1);
  });
});
