import type { Keybinding } from '@pastecode/core';

import { DEFAULT_KEYBINDINGS } from './default-keybindings.js';

/** Cómo se escribe cada modificador y cada tecla especial al mostrarlos. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  meta: 'Win',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  ' ': 'Espacio',
};

/**
 * El atajo de un comando, listo para mostrar al lado de su título.
 *
 * **Sale del mismo lugar del que sale el atajo de verdad**: los de fábrica más
 * los del usuario, en ese orden, y gana el último — que es exactamente la
 * regla que aplica `resolveKeybinding` al resolver una tecla. Una segunda
 * tabla de atajos para la UI mentiría en cuanto alguien editara su
 * `keybindings.json`, que es justo lo que RF-702 permite hacer con la app
 * abierta.
 *
 * Los acordes se muestran con un espacio entre las dos combinaciones, igual
 * que se escriben: `Ctrl+K Ctrl+T`.
 *
 * @param commandId El comando.
 * @param userBindings Los del `keybindings.json`, tal como los tiene el store.
 * @returns El atajo formateado, o `''` si el comando no tiene ninguno.
 * @example
 * shortcutLabel('file.save', []); // 'Ctrl+S'
 */
export function shortcutLabel(commandId: string, userBindings: readonly Keybinding[]): string {
  const all = [...DEFAULT_KEYBINDINGS, ...userBindings];
  // De atrás para adelante: el del usuario pisa al de fábrica, igual que en el
  // resolver. `findLast` diría lo mismo, pero esto deja explícito el porqué.
  const found = [...all].reverse().find((binding) => binding.command === commandId);

  return found === undefined ? '' : formatCombination(found.key);
}

/** `ctrl+k ctrl+t` → `Ctrl+K Ctrl+T`. */
function formatCombination(key: string): string {
  return key
    .split(' ')
    .map((chord) => chord.split('+').map(displayName).join('+'))
    .join(' ');
}

/** Una tecla suelta, como se escribe en pantalla. */
function displayName(part: string): string {
  return DISPLAY_NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part);
}
