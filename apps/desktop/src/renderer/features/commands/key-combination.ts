/** Las teclas que sólo modifican a otra y nunca disparan un atajo solas. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/**
 * Traduce un evento de teclado a la combinación normalizada del resolver.
 *
 * El orden de los modificadores es fijo —`ctrl+shift+alt+meta`— para que la
 * misma pulsación produzca siempre la misma cadena y el `keybindings.json` no
 * dependa de en qué orden los escribió quien lo editó.
 *
 * Usa `event.key` y no `event.code`: en un teclado que no es QWERTY, la tecla
 * física `KeyZ` puede no ser la "z", y lo que la persona pulsa es la letra que
 * ve impresa.
 *
 * @param event El evento de `keydown`.
 * @returns La combinación, o `undefined` si sólo se pulsó un modificador.
 * @example
 * toKeyCombination(event); // 'ctrl+shift+p'
 */
export function toKeyCombination(event: KeyboardEvent): string | undefined {
  if (MODIFIER_KEYS.has(event.key)) return undefined;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  if (event.metaKey) parts.push('meta');

  // Con Shift, `event.key` llega en mayúscula o como el símbolo de arriba;
  // plegarlo mantiene `ctrl+shift+p` estable en cualquier distribución.
  parts.push(event.key.toLowerCase());

  return parts.join('+');
}
