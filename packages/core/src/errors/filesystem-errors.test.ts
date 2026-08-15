import { describe, expect, it } from 'vitest';

import {
  BinaryFileUnsupportedError,
  FileAccessError,
  FileTooLargeError,
  StaleFileError,
} from './filesystem-errors.js';
import { PasteCodeError } from './pastecode-error.js';

describe('FileAccessError', () => {
  it('expone el código estable y hereda de PasteCodeError', () => {
    const error = new FileAccessError('C:\\proyecto\\a.ts');

    expect(error).toBeInstanceOf(PasteCodeError);
    expect(error.code).toBe('FILE_ACCESS_DENIED');
    expect(error.name).toBe('FileAccessError');
  });

  it('deja la ruta en el mensaje técnico y en el del usuario', () => {
    const error = new FileAccessError('C:\\proyecto\\a.ts');

    expect(error.message).toContain('C:\\proyecto\\a.ts');
    expect(error.userMessage).toContain('C:\\proyecto\\a.ts');
  });

  it('preserva el error original del sistema operativo en cause', () => {
    const cause = new Error('EBUSY: resource busy or locked');

    expect(new FileAccessError('a.ts', cause).cause).toBe(cause);
  });
});

describe('FileTooLargeError', () => {
  it('expone el código estable', () => {
    expect(new FileTooLargeError('dump.sql', 82_000_000, 52_428_800).code).toBe(
      'FILE_TOO_LARGE'
    );
  });

  it('traduce los bytes a megabytes en el mensaje que ve el usuario', () => {
    const error = new FileTooLargeError('dump.sql', 78_643_200, 52_428_800);

    expect(error.userMessage).toContain('75.0 MB');
    expect(error.userMessage).toContain('50.0 MB');
  });

  it('deja los bytes exactos en el mensaje técnico, que es el que se loguea', () => {
    const error = new FileTooLargeError('dump.sql', 78_643_200, 52_428_800);

    expect(error.message).toContain('78643200');
    expect(error.message).toContain('52428800');
  });
});

describe('BinaryFileUnsupportedError', () => {
  it('expone el código estable', () => {
    expect(new BinaryFileUnsupportedError('logo.png').code).toBe('BINARY_FILE_UNSUPPORTED');
  });

  it('explica el problema sin jerga', () => {
    expect(new BinaryFileUnsupportedError('logo.png').userMessage).toContain('binario');
  });
});

describe('StaleFileError', () => {
  it('expone el código estable', () => {
    expect(new StaleFileError('a.ts', 1_700_000_000_000, 1_700_000_009_999).code).toBe(
      'STALE_FILE'
    );
  });

  it('deja los dos mtime en el mensaje técnico, que es lo que sirve para diagnosticar', () => {
    const error = new StaleFileError('a.ts', 1_700_000_000_000, 1_700_000_009_999);

    expect(error.message).toContain('1700000000000');
    expect(error.message).toContain('1700000009999');
  });

  it('le ofrece a la persona las dos salidas posibles', () => {
    const error = new StaleFileError('a.ts', 1, 2);

    expect(error.userMessage).toContain('sobrescribirlo');
    expect(error.userMessage).toContain('descartar');
  });
});
