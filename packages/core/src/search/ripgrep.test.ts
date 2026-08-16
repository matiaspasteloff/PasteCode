import { describe, expect, it } from 'vitest';

import type { SearchQuery } from './ripgrep.js';
import { buildRipgrepArgs, parseRipgrepLine } from './ripgrep.js';

/** Una consulta con los valores por defecto de la UI. */
function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return {
    query: 'foo',
    isRegex: false,
    isCaseSensitive: false,
    matchWholeWord: false,
    includeGlobs: [],
    excludeGlobs: [],
    ...overrides,
  };
}

/** Una línea de evento `match` de ripgrep. */
function matchLine(overrides: { path?: string; line?: number; text?: string } = {}): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: overrides.path ?? 'C:\\p\\src\\a.ts' },
      lines: { text: overrides.text ?? 'const foo = 1;\n' },
      line_number: overrides.line ?? 12,
      absolute_offset: 0,
      submatches: [{ match: { text: 'foo' }, start: 6, end: 9 }],
    },
  });
}

describe('buildRipgrepArgs', () => {
  it('pone la raíz al final y el patrón detrás de -e', () => {
    const args = buildRipgrepArgs(query(), 'C:\\p');

    expect(args.at(-1)).toBe('C:\\p');
    expect(args.at(-2)).toBe('foo');
    expect(args.at(-3)).toBe('-e');
  });

  it('no deja que una consulta que empieza con guion se lea como bandera', () => {
    // Sin el `-e`, buscar `-i` activaría el modo insensible en vez de buscarlo.
    const args = buildRipgrepArgs(query({ query: '-i' }), 'C:\\p');

    expect(args.at(-3)).toBe('-e');
    expect(args.at(-2)).toBe('-i');
  });

  it('trata la consulta como texto literal salvo que se pida regex', () => {
    expect(buildRipgrepArgs(query(), 'C:\\p')).toContain('--fixed-strings');
    expect(buildRipgrepArgs(query({ isRegex: true }), 'C:\\p')).not.toContain(
      '--fixed-strings'
    );
  });

  it('es insensible a mayúsculas por defecto', () => {
    expect(buildRipgrepArgs(query(), 'C:\\p')).toContain('--ignore-case');
    expect(buildRipgrepArgs(query({ isCaseSensitive: true }), 'C:\\p')).toContain(
      '--case-sensitive'
    );
  });

  it('agrega la palabra entera sólo si se pide', () => {
    expect(buildRipgrepArgs(query(), 'C:\\p')).not.toContain('--word-regexp');
    expect(buildRipgrepArgs(query({ matchWholeWord: true }), 'C:\\p')).toContain(
      '--word-regexp'
    );
  });

  it('pasa los globs de inclusión tal cual', () => {
    // RF-203: `src/**/*.ts` funciona como patrón de inclusión.
    const args = buildRipgrepArgs(query({ includeGlobs: ['src/**/*.ts'] }), 'C:\\p');

    expect(args).toContain('--glob');
    expect(args).toContain('src/**/*.ts');
  });

  it('niega los globs de exclusión, que vienen de files.exclude', () => {
    const args = buildRipgrepArgs(query({ excludeGlobs: ['**/node_modules'] }), 'C:\\p');

    // Se escriben en las settings sin el `!`; el `!` es sintaxis de ripgrep.
    expect(args).toContain('!**/node_modules');
  });

  it('pide la salida en json y sin color', () => {
    const args = buildRipgrepArgs(query(), 'C:\\p');

    expect(args).toContain('--json');
    expect(args.join(' ')).toContain('--color never');
  });

  it('devuelve cada argumento por separado, nunca una línea de comando', () => {
    // Es la garantía de seguridad: un array llega como argv y no pasa por
    // ningún intérprete.
    const args = buildRipgrepArgs(query({ query: 'a && rm -rf /' }), 'C:\\p');

    expect(args).toContain('a && rm -rf /');
    expect(args.filter((arg) => arg.includes('&&'))).toHaveLength(1);
  });
});

describe('parseRipgrepLine', () => {
  it('traduce un evento match', () => {
    expect(parseRipgrepLine(matchLine())).toEqual({
      path: 'C:\\p\\src\\a.ts',
      line: 12,
      column: 7,
      preview: 'const foo = 1;',
      matchLength: 3,
    });
  });

  it('saca el salto de línea del preview', () => {
    expect(parseRipgrepLine(matchLine({ text: 'hola\r\n' }))?.preview).toBe('hola');
  });

  it('ignora los eventos que no son matches', () => {
    for (const type of ['begin', 'end', 'summary']) {
      expect(parseRipgrepLine(JSON.stringify({ type, data: {} }))).toBeUndefined();
    }
  });

  it('ignora una línea vacía', () => {
    expect(parseRipgrepLine('')).toBeUndefined();
  });

  it('ignora una línea que no es json', () => {
    // Un chunk del stream se puede partir en cualquier lado.
    expect(parseRipgrepLine('{"type":"mat')).toBeUndefined();
  });

  it('ignora un evento match con la forma equivocada', () => {
    // Si una versión futura de ripgrep cambia el formato, el resultado tiene
    // que ser "no aparecen matches", no un crash tres capas más arriba.
    expect(
      parseRipgrepLine(JSON.stringify({ type: 'match', data: { path: 'C:\\a.ts' } }))
    ).toBeUndefined();
  });

  it('ignora un match sin submatches', () => {
    expect(
      parseRipgrepLine(
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: 'a.ts' },
            lines: { text: 'x\n' },
            line_number: 1,
            submatches: [],
          },
        })
      )
    ).toBeUndefined();
  });

  it('toma sólo el primer submatch de una línea', () => {
    // El panel muestra líneas; tres entradas idénticas con distinta columna
    // sería ruido.
    const line = JSON.stringify({
      type: 'match',
      data: {
        path: { text: 'a.ts' },
        lines: { text: 'foo foo foo\n' },
        line_number: 1,
        submatches: [
          { start: 0, end: 3 },
          { start: 4, end: 7 },
        ],
      },
    });

    expect(parseRipgrepLine(line)?.column).toBe(1);
  });
});
