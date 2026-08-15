import { describe, expect, it } from 'vitest';

import { fuzzyMatch, rankByFuzzyMatch } from './fuzzy.js';

describe('fuzzyMatch', () => {
  it('coincide con una subsecuencia, no sólo con un prefijo', () => {
    expect(fuzzyMatch('fsv', 'file.save')).toBeDefined();
  });

  it('exige que los caracteres estén en orden', () => {
    expect(fuzzyMatch('vas', 'file.save')).toBeUndefined();
  });

  it('no coincide si falta un carácter', () => {
    expect(fuzzyMatch('zz', 'file.save')).toBeUndefined();
  });

  it('coincide con todo cuando la consulta está vacía', () => {
    expect(fuzzyMatch('', 'file.save')).toEqual({ score: 0, positions: [] });
  });

  it('devuelve las posiciones que coincidieron, para resaltarlas', () => {
    expect(fuzzyMatch('fs', 'file.save')?.positions).toEqual([0, 5]);
  });

  it('ignora mayúsculas', () => {
    expect(fuzzyMatch('FS', 'file.save')).toBeDefined();
  });

  it('ignora los acentos y la eñe', () => {
    // Quien tipea en la paleta no tiene por qué acordarse de la tilde. `ñ` se
    // descompone en `n` + tilde combinante, así que se pliega a `n`.
    expect(fuzzyMatch('anadir', 'Añadir carpeta')).toBeDefined();
    expect(fuzzyMatch('codigo', 'Formatear código')).toBeDefined();
    expect(fuzzyMatch('CÓDIGO', 'Formatear codigo')).toBeDefined();
  });

  describe('puntaje', () => {
    it('premia el arranque de palabra por encima del medio de una palabra', () => {
      const atWordStart = fuzzyMatch('s', 'file.save')?.score ?? 0;
      const midWord = fuzzyMatch('v', 'file.save')?.score ?? 0;

      expect(atWordStart).toBeGreaterThan(midWord);
    });

    it('premia los caracteres consecutivos', () => {
      const consecutive = fuzzyMatch('sav', 'file.save')?.score ?? 0;
      const scattered = fuzzyMatch('sve', 'file.save')?.score ?? 0;

      expect(consecutive).toBeGreaterThan(scattered);
    });

    it('premia empezar al principio del texto', () => {
      const atStart = fuzzyMatch('fi', 'file.save')?.score ?? 0;
      const later = fuzzyMatch('sa', 'file.save')?.score ?? 0;

      expect(atStart).toBeGreaterThan(later);
    });
  });
});

describe('rankByFuzzyMatch', () => {
  const commands = ['file.save', 'file.saveAll', 'workspace.open', 'editor.selectAll'];

  it('descarta los que no coinciden', () => {
    expect(rankByFuzzyMatch('save', commands, (id) => id)).toEqual([
      'file.save',
      'file.saveAll',
    ]);
  });

  it('pone primero la coincidencia más fuerte', () => {
    // `wo` arranca palabra en `workspace.open`; en `file.saveAll` no coincide.
    expect(rankByFuzzyMatch('wo', commands, (id) => id)[0]).toBe('workspace.open');
  });

  it('devuelve todo cuando la consulta está vacía', () => {
    expect(rankByFuzzyMatch('', commands, (id) => id)).toEqual(commands);
  });

  it('desempata por el orden original, para que no baile entre corridas', () => {
    const tied = ['aa.zz', 'bb.zz'];

    expect(rankByFuzzyMatch('zz', tied, (id) => id)).toEqual(['aa.zz', 'bb.zz']);
  });

  it('acepta una lista vacía', () => {
    expect(rankByFuzzyMatch('x', [], (id: string) => id)).toEqual([]);
  });
});
