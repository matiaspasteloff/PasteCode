import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerClipboardIpcHandlers } from './clipboard.js';

/** Ver la explicación del mock en app.test.ts: se captura el cableado, nada más. */
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
  text: '',
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  clipboard: {
    readText: (): string => electron.text,
    writeText: (value: string): void => {
      electron.text = value;
    },
  },
}));

/** Invoca un canal a través del listener que quedó registrado. */
function invoke(channel: string, payload: unknown = {}): Promise<unknown> {
  return Promise.resolve(electron.handlers.get(channel)?.({}, payload));
}

beforeEach(() => {
  electron.handlers.clear();
  electron.text = '';

  registerClipboardIpcHandlers();
});

describe('registerClipboardIpcHandlers', () => {
  it('registra los dos canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'clipboard:readText',
      'clipboard:writeText',
    ]);
  });
});

describe('clipboard:readText', () => {
  it('devuelve el texto del portapapeles', async () => {
    electron.text = 'pastecode';

    await expect(invoke('clipboard:readText')).resolves.toEqual({
      ok: true,
      value: { text: 'pastecode' },
    });
  });
});

describe('clipboard:writeText', () => {
  it('escribe el texto que le pasan', async () => {
    await expect(invoke('clipboard:writeText', { text: 'hola' })).resolves.toEqual({
      ok: true,
      value: {},
    });

    expect(electron.text).toBe('hola');
  });

  it('rechaza un payload que no cumple el esquema', async () => {
    // El handler valida con Zod antes de tocar el portapapeles: un renderer
    // comprometido no puede mandar cualquier cosa por el canal.
    const result = await invoke('clipboard:writeText', { text: 42 });

    expect(result).toMatchObject({ ok: false });
    expect(electron.text).toBe('');
  });
});
