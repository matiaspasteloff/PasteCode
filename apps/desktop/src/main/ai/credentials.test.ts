import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `safeStorage` falso.
 *
 * El "cifrado" es un prefijo y no algo de verdad: lo que se testea acá no es
 * la criptografía del sistema operativo —ésa es de Electron— sino las
 * decisiones nuestras, que son tres: que sin cifrado disponible **no se
 * guarde**, que la clave se recuerde en memoria, y que un blob que ya no
 * descifra no tumbe nada.
 */
const storage = vi.hoisted((): { available: boolean; fails: boolean; userData: string } => ({
  available: true,
  fails: false,
  userData: '',
}));

const PREFIX = 'cifrado:';

vi.mock('electron', () => ({
  app: { getPath: (): string => storage.userData },
  safeStorage: {
    isEncryptionAvailable: (): boolean => storage.available,
    encryptString: (value: string): Buffer => Buffer.from(PREFIX + value, 'utf8'),
    decryptString: (buffer: Buffer): string => {
      if (storage.fails) throw new Error('no descifra');

      const text = buffer.toString('utf8');

      if (!text.startsWith(PREFIX)) throw new Error('no es nuestro');

      return text.slice(PREFIX.length);
    },
  },
}));

/** El módulo se reimporta en cada test: guarda la clave en memoria. */
let credentials: typeof import('./credentials.js');

beforeEach(async () => {
  vi.resetModules();
  storage.available = true;
  storage.fails = false;
  storage.userData = await mkdtemp(join(tmpdir(), 'pastecode-ai-'));

  credentials = await import('./credentials.js');
});

afterEach(async () => {
  await rm(storage.userData, { recursive: true, force: true });
});

/** El archivo donde vive la clave. */
function file(): string {
  return join(storage.userData, 'ai-credentials.bin');
}

/**
 * El `code` de lo que se haya lanzado.
 *
 * Se compara el código y no la clase porque `vi.resetModules()` le da al módulo
 * bajo prueba **su propia instancia** de `@pastecode/core`: su
 * `EncryptionUnavailableError` no es la misma clase que la que importaría este
 * archivo, así que `instanceof` daría falso con el error correcto en la mano.
 * El `code` es justamente lo que codigo.md declara estable para esto.
 */
function codeOf(cause: unknown): string {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return '';

  const { code } = cause;

  return typeof code === 'string' ? code : '';
}

describe('saveApiKey', () => {
  it('guarda la clave cifrada y la devuelve al leerla', async () => {
    await credentials.saveApiKey('sk-or-test');

    expect(await credentials.loadApiKey()).toBe('sk-or-test');
  });

  it('no deja la clave legible en el archivo', async () => {
    await credentials.saveApiKey('sk-or-test');

    const stored = await readFile(file(), 'utf8');

    expect(stored).not.toContain('sk-or-test');
  });

  it('se niega a guardar si el sistema no ofrece cifrado', async () => {
    // **No hay fallback a texto plano**: una clave en un archivo legible es
    // peor que no poder guardarla, porque quien la guarda cree que está
    // protegida (RF-1003).
    storage.available = false;

    const thrown: unknown = await credentials.saveApiKey('sk').catch((cause: unknown) => cause);

    expect(codeOf(thrown)).toBe('AI_ENCRYPTION_UNAVAILABLE');
  });
});

describe('loadApiKey', () => {
  it('devuelve null cuando no hay ninguna guardada', async () => {
    expect(await credentials.loadApiKey()).toBeNull();
  });

  it('devuelve null si el sistema no ofrece cifrado', async () => {
    storage.available = false;

    expect(await credentials.loadApiKey()).toBeNull();
  });

  it('devuelve null si el blob guardado ya no descifra', async () => {
    // Pasa cuando cambian las credenciales del sistema. La respuesta útil es
    // la misma que la de no tener clave: pedirla de nuevo.
    await writeFile(file(), 'basura', 'utf8');
    storage.fails = true;

    expect(await credentials.loadApiKey()).toBeNull();
  });

  it('lee el disco una sola vez', async () => {
    await credentials.saveApiKey('sk-or-test');
    await credentials.loadApiKey();

    // Si volviera a leer, esto devolvería null: el archivo ya no está.
    await rm(file(), { force: true });

    expect(await credentials.loadApiKey()).toBe('sk-or-test');
  });
});

describe('clearApiKey', () => {
  it('borra la clave del disco y de la memoria', async () => {
    await credentials.saveApiKey('sk-or-test');

    await credentials.clearApiKey();

    expect(await credentials.loadApiKey()).toBeNull();
  });

  it('no falla si no había ninguna', async () => {
    await expect(credentials.clearApiKey()).resolves.toBeUndefined();
  });
});

describe('canPersistApiKey', () => {
  it('refleja lo que dice el sistema operativo', () => {
    expect(credentials.canPersistApiKey()).toBe(true);

    storage.available = false;

    expect(credentials.canPersistApiKey()).toBe(false);
  });
});
