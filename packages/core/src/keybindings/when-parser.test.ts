import { describe, expect, it } from 'vitest';

import { evaluateWhen, type WhenContext } from './resolver.js';
import { parseWhen } from './when-parser.js';

/** Parsea y evalúa de una: es como se usa siempre y se lee mejor. */
function check(expression: string, context: WhenContext): boolean {
  return evaluateWhen(parseWhen(expression), context);
}

describe('parseWhen y evaluateWhen', () => {
  describe('condiciones simples', () => {
    it('resuelve una condición verdadera', () => {
      expect(check('editorFocus', { editorFocus: true })).toBe(true);
    });

    it('resuelve una condición falsa', () => {
      expect(check('editorFocus', { editorFocus: false })).toBe(false);
    });

    it('trata como falsa una condición que no está en el contexto', () => {
      // Los contextos se publican desde la UI y siempre va a haber alguno que
      // todavía no se agregó. Eso no puede romper el teclado.
      expect(check('noExiste', {})).toBe(false);
    });

    it('trata los valores no booleanos por su veracidad', () => {
      expect(check('lenguaje', { lenguaje: 'typescript' })).toBe(true);
      expect(check('lenguaje', { lenguaje: '' })).toBe(false);
    });
  });

  describe('operadores', () => {
    it('niega con !', () => {
      expect(check('!terminalFocus', { terminalFocus: false })).toBe(true);
      expect(check('!terminalFocus', { terminalFocus: true })).toBe(false);
    });

    it('encadena negaciones', () => {
      expect(check('!!editorFocus', { editorFocus: true })).toBe(true);
    });

    it('resuelve &&', () => {
      const context = { editorFocus: true, terminalFocus: false };

      expect(check('editorFocus && !terminalFocus', context)).toBe(true);
      expect(check('editorFocus && terminalFocus', context)).toBe(false);
    });

    it('resuelve ||', () => {
      const context = { editorFocus: true, terminalFocus: false };

      expect(check('terminalFocus || editorFocus', context)).toBe(true);
      expect(check('terminalFocus || panelFocus', context)).toBe(false);
    });

    it('le da más precedencia a && que a ||', () => {
      // `a || (b && c)`, no `(a || b) && c`.
      expect(check('a || b && c', { a: true, b: false, c: false })).toBe(true);
    });

    it('respeta los paréntesis por encima de la precedencia', () => {
      expect(check('(a || b) && c', { a: true, b: false, c: false })).toBe(false);
    });

    it('acepta paréntesis anidados', () => {
      expect(check('((a && b) || c)', { a: true, b: true, c: false })).toBe(true);
    });
  });

  describe('comparaciones', () => {
    it('compara con una cadena', () => {
      expect(check('lenguaje == typescript', { lenguaje: 'typescript' })).toBe(true);
      expect(check('lenguaje == python', { lenguaje: 'typescript' })).toBe(false);
    });

    it('acepta comillas alrededor del valor', () => {
      expect(check("lenguaje == 'typescript'", { lenguaje: 'typescript' })).toBe(true);
    });

    it('compara con un número y no con su texto', () => {
      expect(check('pestanas == 3', { pestanas: 3 })).toBe(true);
      expect(check('pestanas == 3', { pestanas: '3' })).toBe(false);
    });

    it('compara con un booleano', () => {
      expect(check('sucio == true', { sucio: true })).toBe(true);
    });

    it('resuelve !=', () => {
      expect(check('lenguaje != python', { lenguaje: 'typescript' })).toBe(true);
      expect(check('lenguaje != typescript', { lenguaje: 'typescript' })).toBe(false);
    });

    it('combina comparaciones con operadores lógicos', () => {
      const context = { lenguaje: 'typescript', editorFocus: true };

      expect(check('editorFocus && lenguaje == typescript', context)).toBe(true);
    });
  });

  describe('expresiones inválidas', () => {
    it.each([
      ['vacía', ''],
      ['sólo espacios', '   '],
      ['un operador suelto', '&&'],
      ['un && sin operando derecho', 'a &&'],
      ['un paréntesis sin cerrar', '(a && b'],
      ['un paréntesis sin abrir', 'a && b)'],
      ['una negación sin operando', '!'],
    ])('rechaza %s', (_caso, expression) => {
      expect(() => parseWhen(expression)).toThrow(
        expect.objectContaining({ code: 'INVALID_WHEN_EXPRESSION' })
      );
    });
  });

  describe('espacios', () => {
    it('ignora los espacios de más', () => {
      expect(check('  editorFocus   &&   !terminalFocus  ', { editorFocus: true })).toBe(true);
    });

    it('acepta operadores sin espacios alrededor', () => {
      expect(check('editorFocus&&!terminalFocus', { editorFocus: true })).toBe(true);
    });
  });
});
