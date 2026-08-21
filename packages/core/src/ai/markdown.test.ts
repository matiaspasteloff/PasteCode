import { describe, expect, it } from 'vitest';

import { splitMarkdown } from './markdown.js';

describe('splitMarkdown', () => {
  it('devuelve un solo tramo de prosa cuando no hay cercas', () => {
    expect(splitMarkdown('hola\nmundo')).toEqual([{ kind: 'prose', text: 'hola\nmundo' }]);
  });

  it('parte prosa y código, con el lenguaje de la cerca', () => {
    const result = splitMarkdown('Mirá:\n```ts\nconst x = 1;\n```\nlisto');

    expect(result).toEqual([
      { kind: 'prose', text: 'Mirá:' },
      { kind: 'code', language: 'ts', code: 'const x = 1;' },
      { kind: 'prose', text: 'listo' },
    ]);
  });

  it('deja el lenguaje vacío cuando la cerca no lo declara', () => {
    const result = splitMarkdown('```\nplano\n```');

    expect(result).toEqual([{ kind: 'code', language: '', code: 'plano' }]);
  });

  it('devuelve como código el bloque que todavía se está escribiendo', () => {
    // Corre sobre texto que está llegando: una cerca sin cerrar no es un
    // error, y devolverla como prosa haría saltar el formato al final.
    const result = splitMarkdown('Ahí va:\n```py\nprint(1)');

    expect(result).toEqual([
      { kind: 'prose', text: 'Ahí va:' },
      { kind: 'code', language: 'py', code: 'print(1)' },
    ]);
  });

  it('descarta los tramos de prosa que quedan vacíos', () => {
    const result = splitMarkdown('```ts\na\n```\n\n```ts\nb\n```');

    expect(result.map((block) => block.kind)).toEqual(['code', 'code']);
  });

  it('conserva las líneas en blanco de adentro del código', () => {
    const result = splitMarkdown('```ts\na\n\nb\n```');

    expect(result[0]).toEqual({ kind: 'code', language: 'ts', code: 'a\n\nb' });
  });

  it('acepta una cerca indentada', () => {
    const result = splitMarkdown('  ```ts\nconst x = 1;\n  ```');

    expect(result).toEqual([{ kind: 'code', language: 'ts', code: 'const x = 1;' }]);
  });

  it('deja un bloque de código vacío como tal', () => {
    expect(splitMarkdown('```ts\n```')).toEqual([{ kind: 'code', language: 'ts', code: '' }]);
  });

  it('devuelve una lista vacía para un texto vacío', () => {
    expect(splitMarkdown('')).toEqual([]);
    expect(splitMarkdown('   \n  ')).toEqual([]);
  });
});
