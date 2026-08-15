import { describe, expect, it } from 'vitest';

import { createExclusionMatcher, DEFAULT_EXCLUDES } from './exclusions.js';

describe('createExclusionMatcher con los patrones por defecto', () => {
  const isExcluded = createExclusionMatcher(DEFAULT_EXCLUDES);

  it.each(['node_modules', '.git', 'dist'])('excluye %s en la raíz', (path) => {
    expect(isExcluded(path)).toBe(true);
  });

  it.each(['packages/core/node_modules', 'apps/desktop/dist', 'submodulo/.git'])(
    'excluye %s en cualquier profundidad',
    (path) => {
      expect(isExcluded(path)).toBe(true);
    }
  );

  it.each(['src', 'src/index.ts', 'package.json', 'docs/adr/README.md'])(
    'no excluye %s',
    (path) => {
      expect(isExcluded(path)).toBe(false);
    }
  );

  it('no excluye una carpeta cuyo nombre apenas se parece', () => {
    expect(isExcluded('node_modules_viejo')).toBe(false);
    expect(isExcluded('mi_dist')).toBe(false);
    expect(isExcluded('.github')).toBe(false);
  });

  it('acepta rutas con separador de Windows', () => {
    // El separador depende del sistema operativo y los patrones no, así que la
    // normalización tiene que estar de este lado.
    expect(isExcluded('packages\\core\\node_modules')).toBe(true);
    expect(isExcluded('packages\\core\\src')).toBe(false);
  });

  it('no excluye nada si no hay patrones', () => {
    expect(createExclusionMatcher([])('node_modules')).toBe(false);
  });
});

describe('createExclusionMatcher con patrones arbitrarios', () => {
  it('soporta * dentro de un segmento', () => {
    const isExcluded = createExclusionMatcher(['*.log']);

    expect(isExcluded('debug.log')).toBe(true);
    expect(isExcluded('debug.log.txt')).toBe(false);
    // El `*` no cruza separadores: es un segmento, no una ruta.
    expect(isExcluded('logs/debug.log')).toBe(false);
  });

  it('soporta ? como un carácter cualquiera', () => {
    const isExcluded = createExclusionMatcher(['tmp?']);

    expect(isExcluded('tmp1')).toBe(true);
    expect(isExcluded('tmp')).toBe(false);
    expect(isExcluded('tmp12')).toBe(false);
  });

  it('un ** final se come todo lo que quede', () => {
    const isExcluded = createExclusionMatcher(['build/**']);

    expect(isExcluded('build/a/b/c.js')).toBe(true);
    expect(isExcluded('build')).toBe(false);
  });

  it('trata los puntos como literales y no como comodines de regex', () => {
    const isExcluded = createExclusionMatcher(['.git']);

    expect(isExcluded('.git')).toBe(true);
    expect(isExcluded('xgit')).toBe(false);
  });

  it('combina varios patrones', () => {
    const isExcluded = createExclusionMatcher(['**/coverage', '**/*.tmp']);

    expect(isExcluded('packages/core/coverage')).toBe(true);
    expect(isExcluded('a/b/basura.tmp')).toBe(true);
    expect(isExcluded('src/index.ts')).toBe(false);
  });
});
