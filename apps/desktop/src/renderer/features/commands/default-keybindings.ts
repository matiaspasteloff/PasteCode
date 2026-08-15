import type { Keybinding } from '@pastecode/core';

/**
 * Los atajos de fábrica.
 *
 * Van primero en la lista a propósito: ante la misma especificidad el resolver
 * se queda con el último, así que el `keybindings.json` del usuario —que se
 * carga después, en la Etapa 3— puede pisarlos sin ninguna lógica extra.
 *
 * Las teclas se escriben normalizadas y en minúsculas, en el mismo formato que
 * produce `toKeyCombination`.
 */
export const DEFAULT_KEYBINDINGS: readonly Keybinding[] = [
  { key: 'ctrl+s', command: 'file.save' },
  { key: 'ctrl+shift+p', command: 'palette.open' },
  { key: 'ctrl+w', command: 'file.closeTab', when: 'hasOpenTab' },
];
