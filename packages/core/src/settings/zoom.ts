/** El zoom más chico que acepta `window.zoomLevel`. */
export const MIN_ZOOM_LEVEL = -5;

/** El zoom más grande que acepta `window.zoomLevel`. */
export const MAX_ZOOM_LEVEL = 5;

/**
 * Cuánto cambia el zoom por paso.
 *
 * Es la escala de Chromium, no un porcentaje: cada unidad multiplica el tamaño
 * por 1,2. Medio punto es un paso que se nota sin saltar de golpe, y deja
 * veinte pasos entre los dos extremos del rango.
 */
const ZOOM_STEP = 0.5;

/** Hacia dónde mueve el zoom un comando. */
export type ZoomDirection = 'in' | 'out' | 'reset';

/**
 * El siguiente nivel de zoom.
 *
 * Acota al rango del schema de settings: un zoom que se pasa del rango
 * dejaría un `settings.json` que la validación rechaza en la siguiente lectura,
 * y con él toda la configuración del archivo volvería a los defaults.
 *
 * El valor de entrada también se acota, por si viene de un archivo editado a
 * mano que el schema todavía no vio.
 *
 * @param current Nivel actual.
 * @param direction `in` acerca, `out` aleja, `reset` vuelve a 0.
 * @returns El nivel nuevo, dentro de [`MIN_ZOOM_LEVEL`, `MAX_ZOOM_LEVEL`].
 * @example
 * nextZoomLevel(0, 'in');    // 0.5
 * nextZoomLevel(5, 'in');    // 5
 * nextZoomLevel(-2, 'reset'); // 0
 */
export function nextZoomLevel(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') return 0;

  const delta = direction === 'in' ? ZOOM_STEP : -ZOOM_STEP;

  return clamp(current + delta);
}

function clamp(level: number): number {
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, level));
}
