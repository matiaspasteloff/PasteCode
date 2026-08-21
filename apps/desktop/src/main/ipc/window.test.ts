import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerWindowIpcHandlers, watchMaximizedState } from './window.js';

/**
 * Una ventana falsa que registra qué le pidieron.
 *
 * Ver la explicación del mock en `app.test.ts`: se captura el cableado y nada
 * más. Lo que este archivo verifica es que cada canal le pida a la ventana lo
 * que dice su nombre, y que el evento de maximizado salga cuando corresponde.
 */
const electron = vi.hoisted(
  (): {
    handlers: Map<string, (event: unknown, raw: unknown) => unknown>;
    calls: string[];
    isMaximized: boolean;
    hasWindow: boolean;
  } => ({
    handlers: new Map(),
    calls: [],
    isMaximized: false,
    hasWindow: true,
  })
);

/** La ventana falsa, con la forma mínima que usan los handlers y `emit`. */
function fakeWindow() {
  const listeners = new Map<string, () => void>();
  const sent: { channel: string; payload: unknown }[] = [];

  return {
    listeners,
    sent,
    isDestroyed: () => false,
    isMaximized: () => electron.isMaximized,
    minimize: () => electron.calls.push('minimize'),
    maximize: () => electron.calls.push('maximize'),
    unmaximize: () => electron.calls.push('unmaximize'),
    close: () => electron.calls.push('close'),
    on: (event: string, listener: () => void) => listeners.set(event, listener),
    webContents: {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
    },
  };
}

let window = fakeWindow();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, raw: unknown) => unknown): void => {
      electron.handlers.set(channel, listener);
    },
  },
  BrowserWindow: {
    getAllWindows: () => (electron.hasWindow ? [window] : []),
  },
}));

/** Invoca un canal a través del listener que quedó registrado. */
function invoke(channel: string, payload: unknown = {}): Promise<unknown> {
  return Promise.resolve(electron.handlers.get(channel)?.({}, payload));
}

beforeEach(() => {
  electron.handlers.clear();
  electron.calls = [];
  electron.isMaximized = false;
  electron.hasWindow = true;
  window = fakeWindow();

  registerWindowIpcHandlers();
});

describe('registerWindowIpcHandlers', () => {
  it('registra los cuatro canales del dominio', () => {
    expect([...electron.handlers.keys()]).toEqual([
      'window:minimize',
      'window:toggleMaximize',
      'window:close',
      'window:isMaximized',
    ]);
  });
});

describe('window:minimize', () => {
  it('minimiza la ventana', async () => {
    await invoke('window:minimize');

    expect(electron.calls).toEqual(['minimize']);
  });
});

describe('window:toggleMaximize', () => {
  it('maximiza la que está restaurada', async () => {
    await invoke('window:toggleMaximize');

    expect(electron.calls).toEqual(['maximize']);
  });

  it('restaura la que está maximizada', async () => {
    // Un solo canal y no dos: el estado lo tiene el main, y hacer que el
    // renderer elija lo obligaría a decidir con un estado que pudo cambiar
    // hace un milisegundo por un arrastre al borde.
    electron.isMaximized = true;

    await invoke('window:toggleMaximize');

    expect(electron.calls).toEqual(['unmaximize']);
  });
});

describe('window:close', () => {
  it('cierra en vez de destruir, para que corra el apagado ordenado', async () => {
    // `destroy()` se saltearía `before-quit`, que es donde vive el guardado de
    // sesión y la limpieza de procesos hijo de RNF-10.
    await invoke('window:close');

    expect(electron.calls).toEqual(['close']);
  });
});

describe('window:isMaximized', () => {
  it('devuelve el estado actual', async () => {
    electron.isMaximized = true;

    await expect(invoke('window:isMaximized')).resolves.toEqual({
      ok: true,
      value: { isMaximized: true },
    });
  });

  it('devuelve falso cuando no hay ninguna ventana', async () => {
    electron.hasWindow = false;

    await expect(invoke('window:isMaximized')).resolves.toEqual({
      ok: true,
      value: { isMaximized: false },
    });
  });
});

describe('sin ventana', () => {
  it('los canales que actúan no hacen nada en vez de tirar', async () => {
    electron.hasWindow = false;

    await expect(invoke('window:minimize')).resolves.toEqual({ ok: true, value: {} });
    await expect(invoke('window:toggleMaximize')).resolves.toEqual({ ok: true, value: {} });
    await expect(invoke('window:close')).resolves.toEqual({ ok: true, value: {} });
    expect(electron.calls).toEqual([]);
  });
});

describe('watchMaximizedState', () => {
  it('avisa cuando la ventana se maximiza sin que nadie apriete un botón', () => {
    // Es el caso que el evento existe para cubrir: arrastrar la ventana al
    // borde superior la maximiza, y sin esto el glifo del botón se queda
    // mostrando lo contrario de lo que pasó.
    watchMaximizedState(window);
    electron.isMaximized = true;

    window.listeners.get('maximize')?.();

    expect(window.sent).toEqual([
      { channel: 'window:maximizedChanged', payload: { isMaximized: true } },
    ]);
  });

  it('avisa también al restaurar y al salir de pantalla completa', () => {
    watchMaximizedState(window);

    window.listeners.get('unmaximize')?.();
    window.listeners.get('leave-full-screen')?.();

    expect(window.sent).toHaveLength(2);
    expect(window.sent.every((event) => event.channel === 'window:maximizedChanged')).toBe(
      true
    );
  });
});
