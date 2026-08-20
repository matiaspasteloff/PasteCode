import { describe, expect, it } from 'vitest';

import type { Breakpoint } from './breakpoints.js';
import {
  breakpointsIn,
  pathsWithBreakpoints,
  shiftBreakpoints,
  toggleBreakpoint,
} from './breakpoints.js';

/** Un breakpoint con lo mínimo, para no repetir el objeto. */
function at(path: string, line: number, extra: Partial<Breakpoint> = {}): Breakpoint {
  return { path, line, enabled: true, ...extra };
}

const A = 'C:\\p\\a.ts';
const B = 'C:\\p\\b.ts';

describe('toggleBreakpoint', () => {
  it('lo pone donde no había', () => {
    expect(toggleBreakpoint([], A, 12)).toEqual([at(A, 12)]);
  });

  it('lo saca donde ya había', () => {
    expect(toggleBreakpoint([at(A, 12)], A, 12)).toEqual([]);
  });

  it('no confunde la misma línea de dos archivos', () => {
    const result = toggleBreakpoint([at(A, 12)], B, 12);

    expect(result).toEqual([at(A, 12), at(B, 12)]);
  });

  it('devuelve una lista nueva y no toca la que recibió', () => {
    // La lista vive en un store del renderer y en el estado de la sesión;
    // mutarla dejaría a los dos mirando el mismo array sin enterarse.
    const original = [at(A, 12)];

    toggleBreakpoint(original, A, 30);

    expect(original).toEqual([at(A, 12)]);
  });

  it('sacar uno desactivado también lo saca', () => {
    expect(toggleBreakpoint([at(A, 12, { enabled: false })], A, 12)).toEqual([]);
  });
});

describe('breakpointsIn', () => {
  it('devuelve sólo los del archivo, ordenados por línea', () => {
    const all = [at(A, 30), at(B, 1), at(A, 5)];

    expect(breakpointsIn(all, A)).toEqual([at(A, 5), at(A, 30)]);
  });

  it('devuelve vacío para un archivo sin ninguno', () => {
    expect(breakpointsIn([at(A, 5)], B)).toEqual([]);
  });
});

describe('pathsWithBreakpoints', () => {
  it('no repite un archivo con varios', () => {
    // DAP no sabe borrar uno solo: `setBreakpoints` reemplaza todos los de un
    // archivo, así que hace falta la lista de archivos tocados y no de líneas.
    expect(pathsWithBreakpoints([at(A, 1), at(A, 2), at(B, 1)])).toEqual([A, B]);
  });
});

describe('shiftBreakpoints', () => {
  it('no toca lo que está arriba del cambio', () => {
    expect(shiftBreakpoints([at(A, 3)], 10, 0, 5)).toEqual([at(A, 3)]);
  });

  it('baja los de abajo cuando se insertan líneas', () => {
    expect(shiftBreakpoints([at(A, 12)], 5, 0, 2)).toEqual([at(A, 14)]);
  });

  it('sube los de abajo cuando se borran líneas', () => {
    expect(shiftBreakpoints([at(A, 12)], 5, 2, 0)).toEqual([at(A, 10)]);
  });

  it('descarta el que cae adentro de lo borrado', () => {
    // La línea que marcaba ya no existe. Moverlo a la de al lado sería
    // inventar una intención que nadie tuvo.
    expect(shiftBreakpoints([at(A, 6)], 5, 3, 0)).toEqual([]);
  });

  it('conserva la condición y el estado al correrlo', () => {
    const original = at(A, 12, { enabled: false, condition: 'i > 3' });

    expect(shiftBreakpoints([original], 1, 0, 1)).toEqual([{ ...original, line: 13 }]);
  });

  it('un reemplazo del mismo tamaño no mueve nada', () => {
    expect(shiftBreakpoints([at(A, 12)], 5, 3, 3)).toEqual([at(A, 12)]);
  });
});
