import { describe, expect, it } from 'vitest';

import {
  extensionOf,
  LANGUAGE_SERVERS,
  languageServerFor,
  languageServerForPath,
  setOption,
} from './languages.js';

describe('LANGUAGE_SERVERS', () => {
  it('no repite un serverId', () => {
    const ids = LANGUAGE_SERVERS.map((server) => server.serverId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no reparte la misma extensión entre dos servidores', () => {
    const extensions = LANGUAGE_SERVERS.flatMap((server) => server.extensions);

    expect(new Set(extensions).size).toBe(extensions.length);
  });

  it('no reparte el mismo languageId entre dos servidores', () => {
    const ids = LANGUAGE_SERVERS.flatMap((server) => server.languageIds);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declara las extensiones en minúscula y con punto', () => {
    for (const server of LANGUAGE_SERVERS) {
      for (const extension of server.extensions) {
        expect(extension).toBe(extension.toLowerCase());
        expect(extension.startsWith('.')).toBe(true);
      }
    }
  });
});

describe('languageServerFor', () => {
  it('encuentra el servidor de TypeScript', () => {
    expect(languageServerFor('typescript')?.serverId).toBe('typescript');
  });

  it('devuelve undefined para un lenguaje sin servidor', () => {
    expect(languageServerFor('plaintext')).toBeUndefined();
  });
});

describe('languageServerForPath', () => {
  it('resuelve por extensión', () => {
    expect(languageServerForPath('C:\\p\\src\\a.tsx')?.serverId).toBe('typescript');
  });

  it('ignora las mayúsculas', () => {
    expect(languageServerForPath('/p/A.TS')?.serverId).toBe('typescript');
  });

  it('devuelve undefined para un archivo sin servidor', () => {
    expect(languageServerForPath('/p/README.md')).toBeUndefined();
  });
});

describe('extensionOf', () => {
  it('toma la última extensión', () => {
    expect(extensionOf('a.spec.ts')).toBe('.ts');
  });

  it('trata el punto inicial como parte del nombre', () => {
    expect(extensionOf('.gitignore')).toBe('');
  });

  it('devuelve vacío cuando no hay punto', () => {
    expect(extensionOf('C:\\p\\Makefile')).toBe('');
  });
});

describe('setOption', () => {
  it('escribe una clave anidada', () => {
    expect(setOption({}, ['tsserver', 'path'], '/lib')).toEqual({ tsserver: { path: '/lib' } });
  });

  it('conserva lo que ya había al lado', () => {
    const options = { maxTsServerMemory: 3072, tsserver: { logVerbosity: 'off' } };

    expect(setOption(options, ['tsserver', 'path'], '/lib')).toEqual({
      maxTsServerMemory: 3072,
      tsserver: { logVerbosity: 'off', path: '/lib' },
    });
  });

  it('no muta el original', () => {
    const options = { tsserver: { logVerbosity: 'off' } };

    setOption(options, ['tsserver', 'path'], '/lib');

    expect(options).toEqual({ tsserver: { logVerbosity: 'off' } });
  });

  it('pisa un valor que no era objeto en el camino', () => {
    expect(setOption({ tsserver: 'no' }, ['tsserver', 'path'], '/lib')).toEqual({
      tsserver: { path: '/lib' },
    });
  });

  it('devuelve una copia cuando el camino está vacío', () => {
    const options = { a: 1 };

    expect(setOption(options, [], 'x')).toEqual(options);
  });
});
