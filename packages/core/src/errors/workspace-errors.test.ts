import { describe, expect, it } from 'vitest';

import { PasteCodeError } from './pastecode-error.js';
import { PathOutsideWorkspaceError, WorkspaceNotOpenError } from './workspace-errors.js';

describe('PathOutsideWorkspaceError', () => {
  it('expone el código estable y hereda de PasteCodeError', () => {
    const error = new PathOutsideWorkspaceError('C:\\Windows\\System32\\config\\SAM');

    expect(error).toBeInstanceOf(PasteCodeError);
    expect(error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    expect(error.name).toBe('PathOutsideWorkspaceError');
  });

  it('no repite la ruta atacada en el mensaje que se muestra en pantalla', () => {
    // Si el intento vino de una extensión comprometida y no de la persona,
    // mostrarle la ruta no la ayuda a decidir nada y sí le confirma al
    // atacante que el camino existe. La ruta va al log.
    const error = new PathOutsideWorkspaceError('C:\\Windows\\System32\\config\\SAM');

    expect(error.message).toContain('C:\\Windows\\System32\\config\\SAM');
    expect(error.userMessage).not.toContain('System32');
  });

  it('preserva el error original en cause', () => {
    const cause = new Error('ELOOP');

    expect(new PathOutsideWorkspaceError('a.ts', cause).cause).toBe(cause);
  });
});

describe('WorkspaceNotOpenError', () => {
  it('expone el código estable y hereda de PasteCodeError', () => {
    const error = new WorkspaceNotOpenError();

    expect(error).toBeInstanceOf(PasteCodeError);
    expect(error.code).toBe('WORKSPACE_NOT_OPEN');
    expect(error.name).toBe('WorkspaceNotOpenError');
  });

  it('le dice a la persona qué hacer para salir del estado', () => {
    expect(new WorkspaceNotOpenError().userMessage).toContain('Abrí una carpeta');
  });
});
