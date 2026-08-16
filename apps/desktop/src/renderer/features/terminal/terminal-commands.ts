import type { Command } from '@pastecode/core';

import { useTerminalStore } from '../../stores/terminal-store.js';

import { getTerminal } from './terminal-registry.js';

/** Tamaño con el que nace una sesión antes de que xterm mida el panel. */
const INITIAL_DIMENSIONS = { cols: 80, rows: 24 };

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
      handler: () => useTerminalStore.getState().create(INITIAL_DIMENSIONS),
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

/** Abre el panel —creando la primera sesión si hace falta— o lo esconde. */
function toggle(): Promise<void> | undefined {
  const terminal = useTerminalStore.getState();

  if (!terminal.isPanelOpen) return terminal.openPanel();

  terminal.closePanel();

  return undefined;
}

/** Copia la selección de la terminal activa al portapapeles del sistema. */
async function copySelection(): Promise<void> {
  const selection = getTerminal(useTerminalStore.getState().activeSessionId)?.getSelection();

  // Copiar sin selección no es un error: es no hacer nada. Escribir una cadena
  // vacía borraría lo que la persona tenía en el portapapeles.
  if (selection === undefined || selection === '') return;

  await window.pastecode.invoke('clipboard:writeText', { text: selection });
}

/** Pega el portapapeles como entrada del PTY de la terminal activa. */
async function pasteIntoTerminal(): Promise<void> {
  const { activeSessionId } = useTerminalStore.getState();
  if (activeSessionId === null) return;

  const result = await window.pastecode.invoke('clipboard:readText', {});
  if (!result.ok || result.value.text === '') return;

  // Va al PTY y no a xterm: lo que se pega es entrada para el shell, y el eco
  // lo escribe el shell. Escribirlo en xterm lo pintaría dos veces sin
  // ejecutar nada.
  await window.pastecode.invoke('terminal:write', {
    sessionId: activeSessionId,
    data: result.value.text,
  });
}
