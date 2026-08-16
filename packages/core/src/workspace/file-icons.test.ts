import { describe, expect, it } from 'vitest';

import { FILE_ICON_KINDS, fileIconFor } from './file-icons.js';

describe('fileIconFor', () => {
  it.each([
    ['App.tsx', 'code'],
    ['main.rs', 'code'],
    ['build.ps1', 'code'],
    ['index.html', 'markup'],
    ['logo.svg', 'markup'],
    ['global.css', 'style'],
    ['tokens.scss', 'style'],
    ['data.yaml', 'data'],
    ['README.md', 'doc'],
    ['photo.PNG', 'image'],
  ] as const)('clasifica %s como %s', (name, kind) => {
    expect(fileIconFor(name)).toBe(kind);
  });

  it('usa el último punto y no el primero', () => {
    // `foo.spec.ts` es TypeScript. Buscar el primer punto lo dejaría en
    // "default", y en este repositorio eso es la mitad de los archivos.
    expect(fileIconFor('restart-policy.test.ts')).toBe('code');
    expect(fileIconFor('vitest.config.ts')).toBe('code');
  });

  it('trata un punto inicial como parte del nombre, no como extensión', () => {
    expect(fileIconFor('.gitignore')).toBe('config');
    expect(fileIconFor('.desconocido')).toBe('default');
  });

  it('deja que el nombre completo le gane a la extensión', () => {
    // `package.json` es configuración antes que datos: en un árbol de proyecto
    // eso es justamente lo que conviene poder saltear con la vista.
    expect(fileIconFor('package.json')).toBe('config');
    expect(fileIconFor('otro.json')).toBe('data');
  });

  it('no distingue mayúsculas', () => {
    expect(fileIconFor('LICENSE')).toBe('doc');
    expect(fileIconFor('Dockerfile')).toBe('config');
  });

  it('cae en default para lo que no conoce, en vez de fallar', () => {
    expect(fileIconFor('notas')).toBe('default');
    expect(fileIconFor('archivo.qwerty')).toBe('default');
    expect(fileIconFor('')).toBe('default');
  });

  it('sólo devuelve familias declaradas', () => {
    const kinds: readonly string[] = FILE_ICON_KINDS;
    const samples = ['App.tsx', 'a.css', 'b.json', 'c.md', 'd.png', 'e', '.gitignore'];

    for (const sample of samples) expect(kinds).toContain(fileIconFor(sample));
  });
});
