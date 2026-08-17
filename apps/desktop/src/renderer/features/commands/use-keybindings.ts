import { resolveKeybinding, type WhenContext } from '@pastecode/core';
import { useEffect } from 'react';

import { useCommandStore } from '../../stores/command-store.js';
import { selectActiveTabs, useEditorStore } from '../../stores/editor-store.js';
import { useTerminalStore } from '../../stores/terminal-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';

import { DEFAULT_KEYBINDINGS } from './default-keybindings.js';
import { toKeyCombination } from './key-combination.js';

/**
 * Un solo listener de teclado para toda la aplicación.
 *
 * **Uno solo**, y no uno por atajo: con un listener por feature, el orden en
 * que se registran decide quién gana, que es exactamente la clase de bug que
 * no se puede razonar. Acá la decisión la toma `resolveKeybinding`, que es
 * puro y está testeado, y lo único que queda del lado del navegador es armar
 * la combinación y publicar el contexto.
 *
 * Reemplaza a los listeners sueltos de `Ctrl+S` y `Ctrl+Shift+P` de los pasos
 * 15 y 17, que existían justamente hasta que llegara esto.
 *
 * @example
 * useKeybindings(); // una vez, en el cascarón de la app
 */
export function useKeybindings(): void {
  const run = useCommandStore((state) => state.run);
  const openPalette = useCommandStore((state) => state.openPalette);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const combination = toKeyCombination(event);
      if (combination === undefined) return;

      const resolved = resolveKeybinding(DEFAULT_KEYBINDINGS, combination, currentContext());
      if (resolved === null) return;

      // Sólo se cancela el default cuando el atajo es nuestro: si no, `Ctrl+C`
      // y compañía dejarían de funcionar en el editor.
      event.preventDefault();

      // La paleta no es un comando: abrirla desde la paleta misma no tendría
      // sentido, y listarla ahí sería ofrecer algo que ya está pasando.
      if (resolved.command === 'palette.open') openPalette();
      else void run(resolved.command);
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [run, openPalette]);
}

/**
 * El contexto que ven las cláusulas `when`.
 *
 * Se lee con `getState()` en cada pulsación en vez de suscribirse: el atajo
 * necesita el estado del momento en que se apretó la tecla, y suscribirse
 * volvería a montar el listener con cada cambio de estado.
 */
function currentContext(): WhenContext {
  const editor = useEditorStore.getState();
  const tabs = selectActiveTabs(editor);
  const workspace = useWorkspaceStore.getState();

  return {
    hasWorkspace: workspace.workspace !== null,
    hasOpenTab: tabs.activeTabIndex !== -1,
    isDirty: tabs.tabs[tabs.activeTabIndex]?.isDirty ?? false,
    // Clave de contexto nueva: los atajos de foco por grupo sólo existen cuando
    // la pantalla está partida. El resolver ya soporta cláusulas, así que esto
    // es dato y no código.
    hasSecondGroup: editor.groups.groups.length > 1,
    isPaletteOpen: useCommandStore.getState().isPaletteOpen,
    // RF-703 usa literalmente `editorFocus && !terminalFocus` como ejemplo de
    // cláusula `when`, y hasta acá esa clave no existía. La publica la terminal
    // desde el `focus`/`blur` del textarea de xterm.
    terminalFocus: useTerminalStore.getState().hasFocus,
    editorFocus: tabs.activeTabIndex !== -1 && !useTerminalStore.getState().hasFocus,
  };
}
