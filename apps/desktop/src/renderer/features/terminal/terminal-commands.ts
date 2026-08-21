import type { Command } from '@pastecode/core';

import { selectActiveSession, useTerminalStore } from '../../stores/terminal-store.js';
import { useViewStore } from '../../stores/view-store.js';

import { getTerminal } from './terminal-registry.js';

/**
 * Los comandos de la terminal.
 *
 * Viven acá y no en `use-app-commands` para que la feature sea la dueña de sus
 * acciones: el archivo que registra los comandos de la app enumera dominios, y
 * cada dominio dice qué sabe hacer. Es lo mismo que ya hace `features/` con
 * los componentes.
 *
 * Copiar y pegar son comandos —y no handlers de teclado sueltos— porque
 * [RF-304](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)
 * pide el atajo pero la paleta pide la acción: registrarlos una vez da las dos
 * cosas, y de paso deja que una extensión los invoque en la Etapa 5.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of terminalCommands()) register(command);
 */
export function terminalCommands(): readonly Command[] {
  return [
    {
      id: 'terminal.toggle',
      title: 'command.terminalToggle',
      handler: toggle,
    },
    {
      id: 'terminal.new',
      title: 'command.terminalNew',
      // Abrir una terminal ya no lanza nada: agrega un slot, y el PTY lo pide
      // la superficie cuando xterm terminó de medir. Es lo que evita el resize
      // inicial que hacía a conpty reproducir su buffer.
      handler: () => {
        useTerminalStore.getState().openSlot();
      },
    },
    {
      id: 'terminal.copy',
      title: 'command.terminalCopy',
      handler: copySelection,
    },
    {
      id: 'terminal.paste',
      title: 'command.terminalPaste',
      handler: pasteIntoTerminal,
    },
  ];
}

/**
 * Abre el panel en la pestaña de la terminal —creando la primera sesión si hace
 * falta— o lo esconde.
 *
 * El comando coordina dos stores a propósito: si el panel se ve es del
 * cascarón, y qué sesiones existen es de la terminal. Antes las dos cosas
 * estaban en `terminal-store`, que es lo que hacía imposible que el panel
 * alojara una segunda pestaña.
 *
 * Cerrar el panel **no mata nada**: un `npm run dev` corriendo tiene que seguir
 * corriendo aunque no se lo esté mirando. Sí se suelta el foco, que si no
 * dejaría `terminalFocus` en verdadero con el panel escondido y `Ctrl+Shift+C`
 * robándole la combinación al editor.
 */
function toggle(): undefined {
  const view = useViewStore.getState();

  if (view.panelView === 'terminal') {
    view.closePanel();
    useTerminalStore.getState().setFocus(false);

    return undefined;
  }

  view.showPanel('terminal');
  useTerminalStore.getState().ensureSlot();

  return undefined;
}

/** Copia la selección de la terminal activa al portapapeles del sistema. */
async function copySelection(): Promise<void> {
  const selection = getTerminal(useTerminalStore.getState().activeSlotId)?.getSelection();

  // Copiar sin selección no es un error: es no hacer nada. Escribir una cadena
  // vacía borraría lo que la persona tenía en el portapapeles.
  if (selection === undefined || selection === '') return;

  await window.pastecode.invoke('clipboard:writeText', { text: selection });
}

/** Pega el portapapeles como entrada del PTY de la terminal activa. */
async function pasteIntoTerminal(): Promise<void> {
  const session = selectActiveSession(useTerminalStore.getState());

  // Sin proceso todavía no hay adónde pegar: xterm puede estar montado y
  // midiendo mientras el PTY viene en camino.
  if (session === null) return;

  const result = await window.pastecode.invoke('clipboard:readText', {});
  if (!result.ok || result.value.text === '') return;

  // Va al PTY y no a xterm: lo que se pega es entrada para el shell, y el eco
  // lo escribe el shell. Escribirlo en xterm lo pintaría dos veces sin
  // ejecutar nada.
  await window.pastecode.invoke('terminal:write', {
    sessionId: session.sessionId,
    data: result.value.text,
  });
}
