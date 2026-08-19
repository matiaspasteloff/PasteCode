import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DiscoveredExtension } from './scan.js';
import { scanExtensions } from './scan.js';
import { readThemes } from './themes.js';

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'pastecode-themes-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** Escribe una extensión que aporta un tema, con el JSON que se le dé. */
async function writeThemeExtension(
  name: string,
  theme: unknown
): Promise<DiscoveredExtension[]> {
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
      contributes: {
        themes: [{ id: name, label: name, uiTheme: 'dark', path: './theme.json' }],
      },
    }),
    'utf8'
  );

  if (theme !== undefined) {
    await writeFile(
      join(root, 'theme.json'),
      typeof theme === 'string' ? theme : JSON.stringify(theme),
      'utf8'
    );
  }

  return (await scanExtensions([sandbox])).extensions;
}

describe('readThemes', () => {
  it('lee los colores y las reglas de tokenización', async () => {
    const found = await writeThemeExtension('nord', {
      colors: { background: '#2e3440', accent: '#88c0d0' },
      tokenColors: [{ token: 'comment', foreground: '#8b97ab', fontStyle: 'italic' }],
    });

    const [theme] = await readThemes(found);

    expect(theme).toMatchObject({
      id: 'nord',
      uiTheme: 'dark',
      extension: 'nord',
      colors: { background: '#2e3440', accent: '#88c0d0' },
    });
    expect(theme?.tokenColors).toEqual([
      { token: 'comment', foreground: '#8b97ab', fontStyle: 'italic' },
    ]);
  });

  it('una extensión sin temas no aporta ninguno', async () => {
    const found = await writeThemeExtension('vacia', { colors: {} });

    expect((await readThemes(found))[0]?.colors).toEqual({});
  });

  describe('lo que no es un color se descarta', () => {
    it('rechaza un valor que no es hex', async () => {
      // Sin esto, `red; position: fixed; top: 0` se escribiría tal cual en el
      // `style` del documento: un tema podría inyectar CSS arbitrario.
      const found = await writeThemeExtension('inyecta', {
        colors: { background: 'red; position: fixed', accent: '#88c0d0' },
      });

      expect((await readThemes(found))[0]?.colors).toEqual({ accent: '#88c0d0' });
    });

    it('acepta hex de tres, seis y ocho dígitos', async () => {
      const found = await writeThemeExtension('hexes', {
        colors: { background: '#abc', accent: '#88c0d0', border: '#88c0d0ff' },
      });

      expect(Object.keys((await readThemes(found))[0]?.colors ?? {})).toHaveLength(3);
    });

    it('descarta una regla con un foreground que no es hex', async () => {
      const found = await writeThemeExtension('regla', {
        colors: {},
        tokenColors: [
          { token: 'comment', foreground: 'javascript:alert(1)' },
          { token: 'string', foreground: '#a3be8c' },
        ],
      });

      expect((await readThemes(found))[0]?.tokenColors).toEqual([
        { token: 'string', foreground: '#a3be8c' },
      ]);
    });
  });

  describe('un tema roto no tumba la carga', () => {
    it('saltea el que apunta a un archivo que no existe', async () => {
      const found = await writeThemeExtension('fantasma', undefined);

      expect(await readThemes(found)).toEqual([]);
    });

    it('saltea el que no es JSON', async () => {
      const found = await writeThemeExtension('rota', '{ esto no es json');

      expect(await readThemes(found)).toEqual([]);
    });

    it('saltea el que no tiene colores y no se cae', async () => {
      const found = await writeThemeExtension('sinColores', { tokenColors: 'no soy un array' });

      expect((await readThemes(found))[0]).toMatchObject({ colors: {}, tokenColors: [] });
    });
  });
});
