import { clampDimensions } from '@pastecode/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

import { useSettingsStore } from '../../stores/settings-store.js';
import type { TerminalSlot } from '../../stores/terminal-store.js';
import { useTerminalStore } from '../../stores/terminal-store.js';

import { registerTerminal, releaseTerminal } from './terminal-registry.js';
import { terminalTheme } from './terminal-theme.js';

/**
 * Cuánto se espera antes de mandar un resize.
 *
 * Arrastrar el divisor del panel produce decenas de eventos por segundo, y
 * cada uno es un salto de proceso más un `ResizePseudoConsole`. Con 50ms se
 * manda uno solo al soltar, que es cuando el tamaño importa.
 */
const RESIZE_DEBOUNCE_MS = 50;

/** Lo que el hook conserva entre renders de una terminal. */
interface TerminalHandle {
  terminal: Terminal;
  fit: FitAddon;
  /** El último tamaño que se le informó al PTY. */
  reported: { cols: number; rows: number };
}

/**
 * Monta una instancia de xterm, la mide y **recién ahí** pide su PTY.
 *
 * Ése es el arreglo del prompt roto. Antes, la sesión nacía con un `80×24`
 * escrito a mano y el `fit()` posterior mandaba el tamaño real; conpty
 * **reproduce su buffer** al recibir un resize, y ese replay es lo que dejaba
 * a PSReadLine redibujando el prompt encima de sí mismo con una hilera de
 * `>>>>>>>`. Sin resize inicial no hay replay.
 *
 * Una instancia por terminal y ninguna compartida: xterm tiene su propio
 * scrollback y su propio estado de cursor, y acá ese estado no se puede
 * reconstruir leyendo un archivo — lo que la terminal escribió no está en
 * ningún otro lado.
 *
 * @param slot La terminal, con o sin proceso todavía.
 * @param isVisible Si esta terminal es la que se está viendo.
 * @returns La ref del contenedor donde xterm se dibuja.
 * @example
 * const hostRef = useTerminal(slot, isActive);
 */
export function useTerminal(
  slot: TerminalSlot,
  isVisible: boolean
): React.RefObject<HTMLDivElement | null> {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const fontSize = useSettingsStore((state) => state.settings.terminal.fontSize);
  const sessionId = slot.session?.sessionId ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const handle = mount(host, slot.slotId);
    handleRef.current = handle;

    // Medir **antes** de que exista el proceso. Es todo el arreglo.
    if (slot.session === null) {
      handle.fit.fit();
      handle.reported = clampDimensions({
        cols: handle.terminal.cols,
        rows: handle.terminal.rows,
      });

      void useTerminalStore.getState().attachSession(slot.slotId, handle.reported);
    }

    return () => {
      handle.detach();
      handleRef.current = null;
    };
    // Sólo `slotId` en las dependencias: el efecto monta xterm una vez por
    // terminal, y la sesión que llega después la engancha `useSessionWiring`.
    // Volver a montar al recibir el `sessionId` tiraría el buffer que el shell
    // ya escribió, que es exactamente lo que xterm existe para conservar.
  }, [slot.slotId]);

  useSessionWiring(handleRef, sessionId);
  useResizeReporting(hostRef, handleRef, sessionId, isVisible);

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;

    // El tamaño de letra cambia cuántas celdas entran, así que después de
    // tocarlo hay que remedir.
    handle.terminal.options.fontSize = fontSize;
    handle.fit.fit();
  }, [fontSize]);

  useEffect(() => {
    if (!isVisible) return;

    handleRef.current?.terminal.focus();
  }, [isVisible]);

  return hostRef;
}

/** Crea la instancia de xterm y la deja lista para escribir. */
function mount(host: HTMLElement, slotId: string): TerminalHandle & { detach: () => void } {
  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, "Cascadia Mono", monospace',
    fontSize: useSettingsStore.getState().settings.terminal.fontSize,
    // Los 16 ANSI, el cursor y la selección salen del tema activo, no de la
    // paleta de fábrica de xterm. Ver `terminal-theme.ts`.
    theme: terminalTheme(host),
    // El scrollback lo maneja xterm y no el PTY: conpty sólo conoce la ventana
    // visible, así que sin esto no se puede subir a ver qué pasó.
    scrollback: 5000,
  });
  const fit = new FitAddon();

  terminal.loadAddon(fit);
  terminal.open(host);
  registerTerminal(slotId, terminal);

  const onFocus = (): void => {
    useTerminalStore.getState().setFocus(true);
  };
  const onBlur = (): void => {
    useTerminalStore.getState().setFocus(false);
  };

  terminal.textarea?.addEventListener('focus', onFocus);
  terminal.textarea?.addEventListener('blur', onBlur);

  return {
    terminal,
    fit,
    reported: { cols: terminal.cols, rows: terminal.rows },
    detach: () => {
      terminal.textarea?.removeEventListener('focus', onFocus);
      terminal.textarea?.removeEventListener('blur', onBlur);
      releaseTerminal(slotId);
      terminal.dispose();
    },
  };
}

/**
 * Conecta el teclado y la salida del PTY, en cuanto la sesión existe.
 *
 * Va aparte del montaje porque la sesión llega **después**: entre que xterm se
 * monta y que el main devuelve el PTY hay un viaje de IPC, y lo que se teclee
 * en ese intervalo no tiene adónde ir.
 */
function useSessionWiring(
  handleRef: React.RefObject<TerminalHandle | null>,
  sessionId: string | null
): void {
  useEffect(() => {
    const terminal = handleRef.current?.terminal;
    if (terminal === undefined || sessionId === null) return;

    // Lo que se teclea va al PTY sin interpretar: xterm ya tradujo las teclas
    // a las secuencias que un shell espera, y volver a tocarlas rompería
    // Ctrl+C, las flechas y el historial.
    const typed = terminal.onData((data) => {
      void window.pastecode.invoke('terminal:write', { sessionId, data });
    });

    const unsubscribe = window.pastecode.subscribe('terminal:data', (event) => {
      if (event.sessionId === sessionId) terminal.write(event.chunk);
    });

    return () => {
      typed.dispose();
      unsubscribe();
    };
  }, [handleRef, sessionId]);
}

/**
 * Remide y avisa al PTY cuando cambia el tamaño de la superficie.
 *
 * `ResizeObserver` sobre el contenedor y no `window.resize`: colapsar la barra
 * lateral o arrastrar el alto del panel cambian el tamaño de la terminal sin
 * que la ventana cambie de tamaño, y con el listener de ventana esos dos casos
 * dejaban al shell escribiendo contra una grilla que no era la que se veía.
 *
 * La guarda contra el no-op no es una optimización: `ResizePseudoConsole` con
 * el mismo tamaño **también** dispara el replay del buffer de conpty, así que
 * mandar un resize redundante reintroduce el bug que este archivo arregla.
 */
function useResizeReporting(
  hostRef: React.RefObject<HTMLDivElement | null>,
  handleRef: React.RefObject<TerminalHandle | null>,
  sessionId: string | null,
  isVisible: boolean
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || sessionId === null) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const report = (): void => {
      const handle = handleRef.current;
      // Medir con el panel oculto da cero: xterm caería al mínimo y el shell
      // escribiría contra una grilla que no es la que se va a ver.
      if (handle === null || host.offsetHeight === 0) return;

      handle.fit.fit();

      const next = clampDimensions({ cols: handle.terminal.cols, rows: handle.terminal.rows });

      if (next.cols === handle.reported.cols && next.rows === handle.reported.rows) return;

      handle.reported = next;
      void window.pastecode.invoke('terminal:resize', { sessionId, ...next });
    };

    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(report, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(host);
    report();

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [hostRef, handleRef, sessionId, isVisible]);
}
