import { PasteCodeError } from './pastecode-error.js';

/**
 * El renderer nombró una sesión de terminal que el main no tiene.
 *
 * Casi siempre es una carrera legítima y no un ataque: el proceso salió, el
 * main ya sacó la sesión del mapa y el renderer todavía no pintó el evento
 * `terminal:exit`, así que un `write` en vuelo llega tarde. Por eso el
 * `userMessage` habla de una terminal cerrada y no de un error del sistema.
 *
 * Que sea un error y no un no-op es lo que hace que el bug de verdad —el
 * renderer guardando un id que ya no existe— aparezca en el log en vez de
 * manifestarse como una terminal que no responde.
 *
 * @example
 * throw new UnknownTerminalSessionError('terminal-3');
 */
export class UnknownTerminalSessionError extends PasteCodeError {
  constructor(sessionId: string, cause?: unknown) {
    super(
      `No terminal session with id: ${sessionId}`,
      'UNKNOWN_TERMINAL_SESSION',
      'Esa terminal ya se cerró. Abrí una nueva para seguir trabajando.',
      { cause }
    );
  }
}

/**
 * No se pudo lanzar el shell.
 *
 * El caso real es un `terminal.shell` de settings que apunta a un ejecutable
 * que no existe, pero también cubre el arranque fallido de conpty. El
 * `userMessage` nombra el shell porque acá sí ayuda: quien lo configuró es el
 * usuario, y saber cuál falló es la mitad de arreglarlo.
 *
 * @example
 * throw new TerminalSpawnError('C:\\no\\existe.exe', cause);
 */
export class TerminalSpawnError extends PasteCodeError {
  constructor(shell: string, cause?: unknown) {
    super(
      `Failed to spawn shell: ${shell}`,
      'TERMINAL_SPAWN_FAILED',
      `No se pudo abrir la terminal con "${shell}". Revisá que el shell exista y que tengas permiso para ejecutarlo.`,
      { cause }
    );
  }
}
