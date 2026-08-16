import { describe, expect, it } from 'vitest';

import { clampDimensions } from './dimensions.js';

describe('clampDimensions', () => {
  it('deja pasar un tamaño razonable sin tocarlo', () => {
    expect(clampDimensions({ cols: 80, rows: 24 })).toEqual({ cols: 80, rows: 24 });
  });

  it('sube al mínimo lo que xterm reporta mientras el panel se abre', () => {
    expect(clampDimensions({ cols: 0, rows: 0 })).toEqual({ cols: 20, rows: 5 });
  });

  it('baja al máximo un tamaño imposible', () => {
    // Un `offsetWidth` mal medido no es un error de dibujo: conpty reserva un
    // buffer proporcional al tamaño que se le pide.
    expect(clampDimensions({ cols: 1_000_000, rows: 1_000_000 })).toEqual({
      cols: 1000,
      rows: 500,
    });
  });

  it('redondea hacia abajo, no al más cercano', () => {
    // Una fila de más es una fila que el shell escribe y no se ve.
    expect(clampDimensions({ cols: 80.9, rows: 24.9 })).toEqual({ cols: 80, rows: 24 });
  });

  it('cae al mínimo si el número no es finito', () => {
    expect(clampDimensions({ cols: Number.NaN, rows: Number.POSITIVE_INFINITY })).toEqual({
      cols: 20,
      rows: 5,
    });
  });

  it('acota cada eje por separado', () => {
    expect(clampDimensions({ cols: 5000, rows: 1 })).toEqual({ cols: 1000, rows: 5 });
  });
});
