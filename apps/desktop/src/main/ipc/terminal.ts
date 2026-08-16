import type { TerminalDataEvent, TerminalExitEvent } from '@pastecode/ipc-contract';
import {
  CreateTerminalRequestSchema,
  DisposeTerminalRequestSchema,
  ListTerminalsRequestSchema,
  ResizeTerminalRequestSchema,
  WriteTerminalRequestSchema,
} from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import { currentSettings } from '../services/settings.js';
import { resolveShell } from '../services/shell.js';
import { registerDisposer } from '../services/shutdown.js';
import { requireWorkspaceRoot } from '../services/workspace.js';
import type { PtySupervisor } from '../supervisors/pty.js';
import { createPtySupervisor } from '../supervisors/pty.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * El supervisor, creado con la primera terminal.
 *
 * Es perezoso porque necesita la raíz del workspace ([RF-301](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)),
 * y al registrar los handlers todavía no hay ninguna carpeta abierta.
 */
let supervisor: PtySupervisor | undefined;

/**
 * Manda un evento de terminal a todas las ventanas.
 *
 * Hoy hay una sola, pero el supervisor no tiene por qué saber cuál: el día que
 * haya dos, una terminal abierta en la segunda no puede dejar de pintarse
 * porque el evento se mandó a la primera.
 */
function broadcastData(event: TerminalDataEvent): void {
  for (const window of BrowserWindow.getAllWindows()) emit(window, 'terminal:data', event);
}

/** Ídem para el evento de salida. */
function broadcastExit(event: TerminalExitEvent): void {
  for (const window of BrowserWindow.getAllWindows()) emit(window, 'terminal:exit', event);
}

/**
 * El supervisor vivo, creándolo si es la primera terminal de la sesión.
 *
 * @throws {WorkspaceNotOpenError} Si no hay carpeta abierta: sin raíz no hay
 *   cwd, y una terminal que arranca en un directorio arbitrario del disco es
 *   justo lo que la contención del workspace existe para evitar.
 */
function requireSupervisor(): PtySupervisor {
  supervisor ??= createPtySupervisor({
    // El shell se fija al abrir la primera terminal de la sesión. Cambiar
    // `terminal.shell` no re-lanza las que ya están corriendo: matar la
    // terminal de alguien porque tocó un setting sería peor que el retraso.
    shell: resolveShell(currentSettings().terminal.shell),
    cwd: requireWorkspaceRoot(),
    onData: broadcastData,
    onExit: broadcastExit,
  });

  return supervisor;
}

/**
 * Registra los handlers del dominio `terminal`.
 *
 * @example
 * registerTerminalIpcHandlers(); // antes de app.whenReady()
 */
export function registerTerminalIpcHandlers(): void {
  // RF-305 y RNF-10: sin esto, cerrar PasteCode con un `npm run dev` corriendo
  // deja el proceso hijo vivo y sin nadie que lo mate. Desde el paso 26 es un
  // disposer más y no una llamada escrita a mano en `before-quit`, que es lo
  // que hacía que agregar un subsistema con procesos hijo fuera un lugar más
  // donde acordarse de algo.
  registerDisposer('terminal', async () => {
    await supervisor?.disposeAll();
  });

  registerHandler('terminal:create', CreateTerminalRequestSchema, (payload) =>
    requireSupervisor().create(payload)
  );

  registerHandler('terminal:write', WriteTerminalRequestSchema, (payload) => {
    requireSupervisor().write(payload.sessionId, payload.data);

    return {};
  });

  registerHandler('terminal:resize', ResizeTerminalRequestSchema, (payload) => {
    requireSupervisor().resize(payload.sessionId, payload);

    return {};
  });

  registerHandler('terminal:dispose', DisposeTerminalRequestSchema, (payload) => {
    requireSupervisor().dispose(payload.sessionId);

    return {};
  });

  registerHandler('terminal:list', ListTerminalsRequestSchema, () => ({
    sessions: supervisor?.list() ?? [],
  }));
}
