import { describe, expect, it } from 'vitest';

import { PasteCodeError } from './pastecode-error.js';
import { TerminalSpawnError, UnknownTerminalSessionError } from './terminal-errors.js';

describe('UnknownTerminalSessionError', () => {
  it('nombra la sesión en el mensaje técnico, que va al log', () => {
    expect(new UnknownTerminalSessionError('terminal-3').message).toContain('terminal-3');
  });

  it('no le habla al usuario de ids, sino de una terminal cerrada', () => {
    // El caso normal es una carrera: el proceso salió y el renderer todavía no
    // pintó el `terminal:exit`. "terminal-3" no le dice nada a nadie.
    const error = new UnknownTerminalSessionError('terminal-3');

    expect(error.userMessage).not.toContain('terminal-3');
    expect(error.userMessage).toContain('cerró');
  });

  it('expone un code estable', () => {
    expect(new UnknownTerminalSessionError('terminal-1').code).toBe('UNKNOWN_TERMINAL_SESSION');
  });
});

describe('TerminalSpawnError', () => {
  it('nombra el shell en el mensaje del usuario', () => {
    // Acá sí ayuda: quien configuró `terminal.shell` es el usuario, y saber
    // cuál falló es la mitad de arreglarlo.
    expect(new TerminalSpawnError('C:\\no\\existe.exe').userMessage).toContain(
      'C:\\no\\existe.exe'
    );
  });

  it('conserva la causa original', () => {
    const cause = new Error('ENOENT');

    expect(new TerminalSpawnError('sh', cause).cause).toBe(cause);
  });

  it('es un PasteCodeError y se identifica por su propio nombre', () => {
    const error = new TerminalSpawnError('sh');

    expect(error).toBeInstanceOf(PasteCodeError);
    expect(error.name).toBe('TerminalSpawnError');
  });
});
