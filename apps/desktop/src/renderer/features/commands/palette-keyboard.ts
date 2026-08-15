/** Qué hacer ante una tecla: un índice nuevo, o una acción. */
export type PaletteOutcome = number | 'run' | 'close' | 'ignore';

/**
 * Traduce una tecla de la paleta a lo que hay que hacer.
 *
 * Es puro y está separado del componente por lo mismo que el teclado del
 * árbol: los casos de borde —lista vacía, dar la vuelta en los extremos— se
 * testean sin montar React.
 *
 * Las flechas dan la vuelta a propósito: con una lista corta, bajar desde el
 * último para volver al primero es más rápido que subir de a uno.
 *
 * @param key El `event.key` del `keydown`.
 * @param highlighted Índice resaltado actualmente.
 * @param total Cuántos resultados hay.
 * @returns El índice nuevo, o la acción a ejecutar.
 * @example
 * resolvePaletteKey('ArrowDown', 2, 3); // 0, da la vuelta
 */
export function resolvePaletteKey(
  key: string,
  highlighted: number,
  total: number
): PaletteOutcome {
  // Escape y Enter funcionan aunque no haya resultados: cerrar siempre tiene
  // sentido, y Enter sin resultados simplemente no ejecuta nada.
  if (key === 'Escape') return 'close';
  if (key === 'Enter') return 'run';
  if (total === 0) return 'ignore';
  if (key === 'ArrowDown') return (highlighted + 1) % total;
  if (key === 'ArrowUp') return (highlighted - 1 + total) % total;

  return 'ignore';
}
