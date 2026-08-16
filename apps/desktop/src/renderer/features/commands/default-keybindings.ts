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
  // El backtick es la convención que arrastra todo el mundo desde VS Code.
  // Sale de `event.key`, así que es el carácter y no la tecla física: en un
  // teclado español se pulsa donde ese carácter esté impreso.
  { key: 'ctrl+`', command: 'terminal.toggle' },
  // RF-304. Las cláusulas `when` no son decorativas acá: sin `terminalFocus`,
  // `Ctrl+Shift+C` le robaría la combinación a las DevTools y al editor.
  // RF-201. Va con `hasWorkspace`: sin carpeta abierta no hay dónde buscar, y
  // abrir un panel que no puede hacer nada es peor que no responder al atajo.
  { key: 'ctrl+shift+f', command: 'search.toggle', when: 'hasWorkspace' },
  // El explorador, con la misma cláusula y por la misma razón: sin carpeta
  // abierta la vista no tiene nada que listar.
  { key: 'ctrl+shift+e', command: 'view.showExplorer', when: 'hasWorkspace' },
  // RF-205. Mismo criterio: sin carpeta abierta no hay archivos que listar.
  { key: 'ctrl+p', command: 'files.quickOpen', when: 'hasWorkspace' },
  { key: 'ctrl+shift+c', command: 'terminal.copy', when: 'terminalFocus' },
  { key: 'ctrl+shift+v', command: 'terminal.paste', when: 'terminalFocus' },
];
