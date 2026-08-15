import { describe, expect, it } from 'vitest';

import { languageOverrideFor } from './language.js';

describe('languageOverrideFor', () => {
  it('reconoce archivos convencionales sin extensión', () => {
    expect(languageOverrideFor('Dockerfile')).toBe('dockerfile');
  });

  it('no distingue mayúsculas', () => {
    expect(languageOverrideFor('DOCKERFILE')).toBe('dockerfile');
  });

  it('devuelve undefined para lo que Monaco resuelve solo por la extensión', () => {
    // No es rendirse: Monaco resuelve extensiones mejor que cualquier tabla
    // que escribamos, y sobrescribirlo con una lista corta sería peor.
    expect(languageOverrideFor('index.ts')).toBeUndefined();
    expect(languageOverrideFor('estilo.css')).toBeUndefined();
  });

  it('trata como texto plano los archivos de configuración sin gramática', () => {
    expect(languageOverrideFor('.gitignore')).toBe('plaintext');
  });
});
