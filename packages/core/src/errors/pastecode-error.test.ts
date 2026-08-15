import { describe, expect, it } from 'vitest';

import { PasteCodeError } from './pastecode-error.js';

class FileAccessError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `File access denied: ${path}`,
      'FILE_ACCESS_DENIED',
      `No se pudo acceder al archivo. Verificá los permisos de "${path}".`,
      { cause }
    );
  }
}

describe('PasteCodeError', () => {
  it('expone el code y el userMessage por separado del message técnico', () => {
    const error = new PasteCodeError('Technical detail', 'SOME_CODE', 'Algo salió mal.');

    expect(error.message).toBe('Technical detail');
    expect(error.code).toBe('SOME_CODE');
    expect(error.userMessage).toBe('Algo salió mal.');
  });

  it('es capturable como Error cuando se lanza', () => {
    expect(() => {
      throw new PasteCodeError('boom', 'BOOM', 'Se rompió algo.');
    }).toThrow(Error);
  });

  it('usa el nombre de la subclase cuando se hereda', () => {
    const error = new FileAccessError('/tmp/a.txt');

    // La UI muestra userMessage, pero el log muestra name + message, y un
    // "Error: ..." genérico en el log no dice nada sobre qué falló.
    expect(error.name).toBe('FileAccessError');
    expect(new PasteCodeError('x', 'X', 'x').name).toBe('PasteCodeError');
  });

  it('preserva el error original en cause cuando se le pasa uno', () => {
    const original = new Error('ENOENT');
    const error = new FileAccessError('/tmp/a.txt', original);

    expect(error.cause).toBe(original);
  });

  it('deja cause en undefined cuando no se le pasa ninguno', () => {
    const error = new FileAccessError('/tmp/a.txt');

    expect(error.cause).toBeUndefined();
  });

  it('sigue siendo instancia de PasteCodeError en las subclases', () => {
    const error = new FileAccessError('/tmp/a.txt');

    // Es lo que permite que un catch genérico distinga un error nuestro
    // —con userMessage mostrable— de un TypeError inesperado.
    expect(error).toBeInstanceOf(PasteCodeError);
    expect(error).toBeInstanceOf(Error);
  });
});
