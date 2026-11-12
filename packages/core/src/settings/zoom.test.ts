import { describe, expect, it } from 'vitest';

import { SettingsFileSchema } from './schema.js';
import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, nextZoomLevel } from './zoom.js';

describe('nextZoomLevel', () => {
  it.each([
    [0, 'in', 0.5],
    [0, 'out', -0.5],
    [1.5, 'in', 2],
    [-1.5, 'out', -2],
    [3, 'reset', 0],
    [-4.5, 'reset', 0],
  ] as const)('%s, %s → %s', (current, direction, expected) => {
    expect(nextZoomLevel(current, direction)).toBe(expected);
  });

  it('no pasa del máximo', () => {
    expect(nextZoomLevel(MAX_ZOOM_LEVEL, 'in')).toBe(MAX_ZOOM_LEVEL);
    expect(nextZoomLevel(4.8, 'in')).toBe(MAX_ZOOM_LEVEL);
  });

  it('no pasa del mínimo', () => {
    expect(nextZoomLevel(MIN_ZOOM_LEVEL, 'out')).toBe(MIN_ZOOM_LEVEL);
    expect(nextZoomLevel(-4.8, 'out')).toBe(MIN_ZOOM_LEVEL);
  });

  it('vuelve al rango un valor que ya venía de afuera', () => {
    expect(nextZoomLevel(9, 'out')).toBe(MAX_ZOOM_LEVEL);
    expect(nextZoomLevel(-9, 'in')).toBe(MIN_ZOOM_LEVEL);
  });

  it('el rango es el mismo que acepta el schema de settings', () => {
    const accepts = (zoomLevel: number): boolean =>
      SettingsFileSchema.safeParse({ window: { zoomLevel } }).success;

    expect(accepts(MAX_ZOOM_LEVEL)).toBe(true);
    expect(accepts(MIN_ZOOM_LEVEL)).toBe(true);
    expect(accepts(MAX_ZOOM_LEVEL + 0.5)).toBe(false);
    expect(accepts(MIN_ZOOM_LEVEL - 0.5)).toBe(false);
  });
});
