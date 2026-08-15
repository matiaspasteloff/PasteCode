import { describe, expect, it } from 'vitest';

import { resolvePaletteKey } from './palette-keyboard.js';

describe('resolvePaletteKey', () => {
  it('baja un lugar con ArrowDown', () => {
    expect(resolvePaletteKey('ArrowDown', 0, 3)).toBe(1);
  });

  it('da la vuelta al llegar al final', () => {
    expect(resolvePaletteKey('ArrowDown', 2, 3)).toBe(0);
  });

  it('sube un lugar con ArrowUp', () => {
    expect(resolvePaletteKey('ArrowUp', 2, 3)).toBe(1);
  });

  it('da la vuelta al subir desde el primero', () => {
    expect(resolvePaletteKey('ArrowUp', 0, 3)).toBe(2);
  });

  it('cierra con Escape', () => {
    expect(resolvePaletteKey('Escape', 0, 3)).toBe('close');
  });

  it('ejecuta con Enter', () => {
    expect(resolvePaletteKey('Enter', 1, 3)).toBe('run');
  });

  it('cierra con Escape aunque no haya resultados', () => {
    // Cerrar siempre tiene sentido, incluso —sobre todo— cuando la búsqueda no
    // encontró nada.
    expect(resolvePaletteKey('Escape', 0, 0)).toBe('close');
  });

  it('ignora las flechas cuando no hay resultados', () => {
    expect(resolvePaletteKey('ArrowDown', 0, 0)).toBe('ignore');
    expect(resolvePaletteKey('ArrowUp', 0, 0)).toBe('ignore');
  });

  it.each(['a', 'Tab', 'Backspace', ' '])('ignora %s, que le toca al input', (key) => {
    expect(resolvePaletteKey(key, 0, 3)).toBe('ignore');
  });
});
