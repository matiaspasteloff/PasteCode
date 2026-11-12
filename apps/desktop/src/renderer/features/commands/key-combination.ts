import type { Platform } from '@pastecode/ipc-contract';

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
 * **En macOS, `Cmd` es `ctrl`.** Los atajos se escriben una sola vez, con
 * `ctrl`, y en macOS la tecla que hace ese trabajo es `Cmd`: pedirle a quien
 * usa una Mac que guarde con `Control+S` es tener los atajos de otro sistema.
 * Ahí `Control` también cuenta como `ctrl`, para que nadie quede sin forma de
 * apretar un atajo, y `meta` no se produce nunca.
 *
 * @param event El evento de `keydown`.
 * @param platform El sistema operativo, de `window.pastecode.platform`.
 * @returns La combinación, o `undefined` si sólo se pulsó un modificador.
 * @example
 * toKeyCombination(event, 'win32'); // 'ctrl+shift+p'
 */
export function toKeyCombination(event: KeyboardEvent, platform: Platform): string | undefined {
  if (MODIFIER_KEYS.has(event.key)) return undefined;

  const isMac = platform === 'darwin';
  const parts: string[] = [];
  if (event.ctrlKey || (isMac && event.metaKey)) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  if (event.metaKey && !isMac) parts.push('meta');

  // Con Shift, `event.key` llega en mayúscula o como el símbolo de arriba;
  // plegarlo mantiene `ctrl+shift+p` estable en cualquier distribución.
  parts.push(event.key.toLowerCase());

  return parts.join('+');
}
