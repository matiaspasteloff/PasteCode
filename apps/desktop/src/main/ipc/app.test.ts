import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAppIpcHandlers } from './app.js';

/**
 * `vi.hoisted` porque la fábrica de `vi.mock` se eleva por encima de todo el
 * módulo y no puede leer un `const` declarado más abajo.
 */
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
  version: '9.9.9',
}));

/**
 * El único mock del main, y es de dos métodos.
 *
 * Lo que se verifica acá es el cableado: que el nombre del canal registrado
 * sea exactamente el del contrato, y que lo que devuelve el handler llegue
 * envuelto en `IpcResult`. Un canal registrado con el nombre mal typechequea
 * igual y falla recién en runtime, así que vale un test. Levantar un Electron
 * de verdad para eso es lo que hace el E2E, no un unitario.
 */
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  app: { getVersion: (): string => electron.version },
}));

beforeEach(() => {
  electron.handlers.clear();
});

describe('registerAppIpcHandlers', () => {
  it('registra el canal con el nombre exacto del contrato', () => {
    registerAppIpcHandlers();

    expect([...electron.handlers.keys()]).toEqual(['app:getVersion']);
  });

  it('responde la versión de la app envuelta en IpcResult', async () => {
    registerAppIpcHandlers();
    const listener = electron.handlers.get('app:getVersion');

    const result = await listener?.({}, {});

    expect(result).toEqual({ ok: true, value: { version: '9.9.9' } });
  });

  it('rechaza un payload con datos de más, porque el schema es estricto', async () => {
    registerAppIpcHandlers();
    const listener = electron.handlers.get('app:getVersion');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await listener?.({}, { inesperado: true });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        userMessage: 'Algo salió mal. Si vuelve a pasar, revisá el log de la aplicación.',
      },
    });
  });
});
