import type { Keybinding } from '@pastecode/core';
import type { Platform } from '@pastecode/ipc-contract';

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
 * Los modificadores en macOS, en el orden en que los escribe el sistema
 * (`⌃⌥⇧⌘`) y sin `+` entre ellos: `⇧⌘P` y no `Ctrl+Shift+P`. `ctrl` es `⌘`
 * porque es la tecla que lo dispara ahí (`key-combination.ts`).
 */
const MAC_MODIFIERS: readonly (readonly [string, string])[] = [
  ['alt', '⌥'],
  ['shift', '⇧'],
  ['ctrl', '⌘'],
];

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
 * En macOS se escribe con los símbolos del sistema: `⌘S`, `⇧⌘P`.
 *
 * @param commandId El comando.
 * @param userBindings Los del `keybindings.json`, tal como los tiene el store.
 * @param platform El sistema operativo, de `window.pastecode.platform`.
 * @returns El atajo formateado, o `''` si el comando no tiene ninguno.
 * @example
 * shortcutLabel('file.save', [], 'win32'); // 'Ctrl+S'
 * shortcutLabel('file.save', [], 'darwin'); // '⌘S'
 */
export function shortcutLabel(
  commandId: string,
  userBindings: readonly Keybinding[],
  platform: Platform
): string {
  const all = [...DEFAULT_KEYBINDINGS, ...userBindings];
  // De atrás para adelante: el del usuario pisa al de fábrica, igual que en el
  // resolver. `findLast` diría lo mismo, pero esto deja explícito el porqué.
  const found = [...all].reverse().find((binding) => binding.command === commandId);

  return found === undefined ? '' : formatCombination(found.key, platform);
}

/** `ctrl+k ctrl+t` → `Ctrl+K Ctrl+T`, o `⌘K ⌘T` en macOS. */
function formatCombination(key: string, platform: Platform): string {
  const formatChord = platform === 'darwin' ? formatMacChord : formatChordWithPlus;
  return key.split(' ').map(formatChord).join(' ');
}

/** `ctrl+shift+p` → `Ctrl+Shift+P`. */
function formatChordWithPlus(chord: string): string {
  return chord.split('+').map(displayName).join('+');
}

/** `ctrl+shift+p` → `⇧⌘P`: los modificadores en el orden de macOS, pegados. */
function formatMacChord(chord: string): string {
  const parts = chord.split('+');
  const modifiers = MAC_MODIFIERS.filter(([name]) => parts.includes(name)).map(
    ([, symbol]) => symbol
  );
  const rest = parts.filter((part) => !MAC_MODIFIERS.some(([name]) => name === part));

  return [...modifiers, ...rest.map(displayName)].join('');
}

/** Una tecla suelta, como se escribe en pantalla. */
function displayName(part: string): string {
  return DISPLAY_NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part);
}
