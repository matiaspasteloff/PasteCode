import { resolveKeybinding, type Keybinding, type WhenContext } from '@pastecode/core';
import { useEffect, useRef } from 'react';

import { useCommandStore } from '../../stores/command-store.js';
import { selectActiveTabs, useEditorStore } from '../../stores/editor-store.js';
import { useKeybindingsStore } from '../../stores/keybindings-store.js';
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
  const load = useKeybindingsStore((state) => state.load);
  const apply = useKeybindingsStore((state) => state.apply);
  /**
   * La primera mitad de un acorde, si se está esperando la segunda.
   *
   * Es un ref y no estado: cambiarlo no tiene que repintar nada, y con estado
   * el listener se volvería a montar entre las dos teclas del acorde.
   */
  const pendingChord = useRef<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // RF-702: editar `~/.pastecode/keybindings.json` con la app abierta cambia el
  // atajo sin reiniciar. El main observa el archivo y emite; esto escucha.
  useEffect(
    () =>
      window.pastecode.subscribe('keybindings:changed', (event) => {
        apply(event.bindings, event.conflicts, event.error);
      }),
    [apply]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const combination = toKeyCombination(event);
      if (combination === undefined) return;

      // Los del usuario van **después** de los de fábrica: ante la misma
      // especificidad el resolver se queda con el último, y eso es lo que hace
      // que el archivo del usuario pise sin ninguna lógica extra (RF-702).
      // Se leen con `getState()` y no por suscripción por la misma razón que el
      // contexto: el listener no se tiene que volver a montar con cada cambio.
      const bindings = [...DEFAULT_KEYBINDINGS, ...useKeybindingsStore.getState().bindings];

      // Un acorde es un atajo cuya tecla son dos combinaciones separadas por un
      // espacio (`ctrl+k ctrl+t`). La primera no dispara nada: se recuerda y se
      // resuelve la unión con la siguiente. El resolver no cambia — lo que
      // cambia es qué cadena se le pasa.
      const started = pendingChord.current;
      const candidate = started === null ? combination : `${started} ${combination}`;
      const resolved = resolveKeybinding(bindings, candidate, currentContext());

      if (resolved === null) {
        pendingChord.current = startsChord(bindings, started, combination) ? combination : null;

        // El prefijo de un acorde también se cancela: sin esto, `Ctrl+K` haría
        // lo que el navegador quiera mientras se espera la segunda tecla.
        if (pendingChord.current !== null) event.preventDefault();

        return;
      }

      pendingChord.current = null;

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
  }, [run, openPalette, pendingChord]);
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

/**
 * Si una combinación abre un acorde que todavía no empezó.
 *
 * `started !== null` significa que ya se estaba esperando la segunda tecla y no
 * llegó ninguna que sirva: ahí el acorde se abandona en vez de encadenar un
 * tercero, que es lo que espera cualquiera que se equivocó de tecla.
 */
function startsChord(
  bindings: readonly Keybinding[],
  started: string | null,
  combination: string
): boolean {
  return (
    started === null && bindings.some((binding) => binding.key.startsWith(`${combination} `))
  );
}
