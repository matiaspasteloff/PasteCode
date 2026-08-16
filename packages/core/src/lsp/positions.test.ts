import { describe, expect, it } from 'vitest';

import { fromLspPosition, fromLspRange, toLspPosition, toLspRange } from './positions.js';

describe('toLspPosition', () => {
  it('resta uno a la línea y a la columna', () => {
    expect(toLspPosition({ line: 12, column: 5 })).toEqual({ line: 11, character: 4 });
  });

  it('mapea el origen del contrato al origen del protocolo', () => {
    expect(toLspPosition({ line: 1, column: 1 })).toEqual({ line: 0, character: 0 });
  });

  it('no produce coordenadas negativas', () => {
    expect(toLspPosition({ line: 0, column: 0 })).toEqual({ line: 0, character: 0 });
  });
});

describe('fromLspPosition', () => {
  it('suma uno a la línea y al carácter', () => {
    expect(fromLspPosition({ line: 11, character: 4 })).toEqual({ line: 12, column: 5 });
  });

  it('no produce coordenadas menores a uno', () => {
    expect(fromLspPosition({ line: -3, character: -1 })).toEqual({ line: 1, column: 1 });
  });
});

describe('ida y vuelta', () => {
  it('vuelve al mismo valor para toda posición válida', () => {
    for (const position of [
      { line: 1, column: 1 },
      { line: 2, column: 40 },
      { line: 9999, column: 1 },
    ]) {
      expect(fromLspPosition(toLspPosition(position))).toEqual(position);
    }
  });
});

describe('rangos', () => {
  it('convierte los dos extremos', () => {
    const range = { start: { line: 3, column: 2 }, end: { line: 3, column: 9 } };

    expect(toLspRange(range)).toEqual({
      start: { line: 2, character: 1 },
      end: { line: 2, character: 8 },
    });
    expect(fromLspRange(toLspRange(range))).toEqual(range);
  });
});
