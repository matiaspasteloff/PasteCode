import { PasteCodeError } from '@pastecode/core';
import { GetVersionRequestSchema } from '@pastecode/ipc-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInvocation } from './handler.js';

beforeEach(() => {
  // El envoltorio loguea todo lo que atrapa, que es justamente lo que
  // queremos. Silenciarlo evita llenar la salida de los tests de stacks
  // esperados, y de paso deja verificar que el log ocurrió.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Un error del proyecto cualquiera, para no repetirlo en cada caso. */
function diskOnFire(): PasteCodeError {
  return new PasteCodeError('Disk on fire', 'DISK_ON_FIRE', 'El disco está en llamas.');
}

describe('createInvocation', () => {
  it('devuelve ok con el valor cuando el handler responde', async () => {
    const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, () => ({
      version: '1.2.3',
    }));

    await expect(invoke({})).resolves.toEqual({ ok: true, value: { version: '1.2.3' } });
  });

  it('espera a un handler asíncrono antes de responder', async () => {
    const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, () =>
      Promise.resolve({ version: '1.2.3' })
    );

    await expect(invoke({})).resolves.toEqual({ ok: true, value: { version: '1.2.3' } });
  });

  it('traduce un PasteCodeError a su code y su userMessage', async () => {
    const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, () => {
      throw diskOnFire();
    });

    await expect(invoke({})).resolves.toEqual({
      ok: false,
      error: { code: 'DISK_ON_FIRE', userMessage: 'El disco está en llamas.' },
    });
  });

  it('no deja escapar el mensaje técnico de un error inesperado', async () => {
    const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, () => {
      throw new TypeError('cannot read properties of undefined (reading C:\\Users\\matias)');
    });

    const result = await invoke({});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('UNEXPECTED_ERROR');
    expect(JSON.stringify(result)).not.toContain('Users');
  });

  it('rechaza un payload que no cumple el schema, sin llamar al handler', async () => {
    const handle = vi.fn(() => ({ version: '1.2.3' }));
    const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, handle);

    // El schema es estricto: mandar datos de más es un error, no algo que se
    // ignora en silencio. Es el renderer intentando algo que no debería.
    const result = await invoke({ inesperado: true });

    expect(!result.ok && result.error.code).toBe('UNEXPECTED_ERROR');
    expect(handle).not.toHaveBeenCalled();
  });

  it('loguea en el main el error que atrapa, con el canal que lo produjo', async () => {
    const errorLog = vi.spyOn(console, 'error');
    const invoke = createInvocation('app:getVersion', GetVersionRequestSchema, () => {
      throw diskOnFire();
    });

    await invoke({});

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('app:getVersion'),
      expect.any(PasteCodeError)
    );
  });
});
