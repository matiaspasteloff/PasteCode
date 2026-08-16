import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

import { useTerminalStore } from '../../stores/terminal-store.js';

import { registerTerminal, releaseTerminal } from './terminal-registry.js';

/**
 * Crea la instancia de xterm de una sesión y la conecta con su PTY.
 *
 * Devuelve la función que desarma todo. Está separada del hook para que el
 * efecto se lea de un vistazo: acá está el cableado, allá está el ciclo de
 * vida de React.
 */
function attachTerminal(
  host: HTMLElement,
  sessionId: string
): { terminal: Terminal; fit: FitAddon; detach: () => void } {
  const styles = getComputedStyle(host);
  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, "Cascadia Mono", monospace',
    fontSize: 13,
    // Los colores salen de los tokens CSS y no de una paleta propia: es lo que
    // hace que la terminal siga al tema de RF-801/802 sin código de tema.
    theme: {
      background: styles.getPropertyValue('--color-surface').trim(),
      foreground: styles.getPropertyValue('--color-foreground').trim(),
    },
    // El scrollback lo maneja xterm y no el PTY: conpty sólo conoce la ventana
    // visible, así que sin esto no se puede subir a ver qué pasó.
    scrollback: 5000,
  });
  const fit = new FitAddon();

  terminal.loadAddon(fit);
  terminal.open(host);
  registerTerminal(sessionId, terminal);

  // Lo que se teclea va al PTY sin interpretar: xterm ya tradujo las teclas a
  // las secuencias que un shell espera, y volver a tocarlas rompería Ctrl+C,
  // las flechas y el historial.
  const typed = terminal.onData((data) => {
    void window.pastecode.invoke('terminal:write', { sessionId, data });
  });

  // RF-303: sin esto, los programas de pantalla completa dibujan contra un
  // tamaño que no es el que se ve.
  const resized = terminal.onResize(({ cols, rows }) => {
    void window.pastecode.invoke('terminal:resize', { sessionId, cols, rows });
  });

  const onFocus = (): void => {
    useTerminalStore.getState().setFocus(true);
  };
  const onBlur = (): void => {
    useTerminalStore.getState().setFocus(false);
  };

  terminal.textarea?.addEventListener('focus', onFocus);
  terminal.textarea?.addEventListener('blur', onBlur);

  const unsubscribe = window.pastecode.subscribe('terminal:data', (event) => {
    if (event.sessionId === sessionId) terminal.write(event.chunk);
  });

  return {
    terminal,
    fit,
    detach: () => {
      unsubscribe();
      typed.dispose();
      resized.dispose();
      terminal.textarea?.removeEventListener('focus', onFocus);
      terminal.textarea?.removeEventListener('blur', onBlur);
      releaseTerminal(sessionId);
      terminal.dispose();
    },
  };
}

/**
 * Monta una instancia de xterm y la mantiene atada a su sesión.
 *
 * Una instancia por sesión y ninguna compartida: xterm tiene su propio buffer
 * de scrollback y su propio estado de cursor, así que reusar una sola para
 * varias sesiones obligaría a serializar y restaurar todo eso en cada cambio
 * de pestaña. Es el mismo razonamiento que el `EditorModelRegistry` de Monaco,
 * con la diferencia de que acá el estado no se puede reconstruir leyendo un
 * archivo: lo que la terminal escribió no está en ningún lado más.
 *
 * @param sessionId Sesión a la que se engancha.
 * @param isVisible Si el panel de esta sesión está a la vista.
 * @returns La ref del contenedor donde xterm se dibuja.
 * @example
 * const hostRef = useTerminal(session.sessionId, isActive);
 * return <div ref={hostRef} className="terminal-panel__surface" />;
 */
export function useTerminal(
  sessionId: string,
  isVisible: boolean
): React.RefObject<HTMLDivElement | null> {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const attached = attachTerminal(host, sessionId);

    fitRef.current = attached.fit;
    terminalRef.current = attached.terminal;

    return () => {
      attached.detach();
      fitRef.current = null;
      terminalRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!isVisible) return;

    // Medir con el panel oculto da cero: xterm caería al mínimo y el shell
    // escribiría contra una grilla que no es la que se va a ver.
    fitRef.current?.fit();
    terminalRef.current?.focus();

    const onWindowResize = (): void => {
      fitRef.current?.fit();
    };

    window.addEventListener('resize', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
    };
  }, [isVisible]);

  return hostRef;
}
