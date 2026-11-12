import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RevealableWindow } from './single-instance.js';

/** `app` y `BrowserWindow` falsos: el bloqueo y el evento se anotan. */
const electron = vi.hoisted(
  (): {
    lock: boolean;
    requested: number;
    listeners: Map<string, () => void>;
    windows: RevealableWindow[];
  } => ({ lock: true, requested: 0, listeners: new Map(), windows: [] })
);

vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: (): boolean => {
      electron.requested += 1;
      return electron.lock;
    },
    on: (event: string, listener: () => void): void => {
      electron.listeners.set(event, listener);
    },
  },
  BrowserWindow: { getAllWindows: (): RevealableWindow[] => electron.windows },
}));

const { claimSingleInstance, revealWindow, shouldRequestSingleInstanceLock } =
  await import('./single-instance.js');

/** Una ventana falsa que anota lo que le hicieron, en orden. */
function fakeWindow(minimized: boolean): RevealableWindow & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    isMinimized: () => minimized,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
}

beforeEach(() => {
  electron.lock = true;
  electron.requested = 0;
  electron.listeners = new Map();
  electron.windows = [];
});

describe('shouldRequestSingleInstanceLock', () => {
  it('lo pide en uso normal', () => {
    expect(shouldRequestSingleInstanceLock(undefined)).toBe(true);
  });

  it('no lo pide bajo el directorio de datos del E2E', () => {
    expect(shouldRequestSingleInstanceLock('/tmp/pastecode-e2e-home')).toBe(false);
  });
});

describe('revealWindow', () => {
  it('restaura una ventana minimizada antes de enfocarla', () => {
    const window = fakeWindow(true);
    revealWindow(window);

    expect(window.calls).toEqual(['restore', 'show', 'focus']);
  });

  it('no restaura la que no estaba minimizada', () => {
    const window = fakeWindow(false);
    revealWindow(window);

    expect(window.calls).toEqual(['show', 'focus']);
  });

  it('sin ventana no hace nada', () => {
    expect(() => {
      revealWindow(undefined);
    }).not.toThrow();
  });
});

describe('claimSingleInstance', () => {
  it('con el bloqueo, trae al frente la ventana cuando se abre otra instancia', () => {
    const window = fakeWindow(true);
    electron.windows = [window];

    expect(claimSingleInstance(undefined)).toBe(true);

    electron.listeners.get('second-instance')?.();
    expect(window.calls).toEqual(['restore', 'show', 'focus']);
  });

  it('sin el bloqueo, avisa que hay que salir', () => {
    electron.lock = false;

    expect(claimSingleInstance(undefined)).toBe(false);
    expect(electron.listeners.has('second-instance')).toBe(false);
  });

  it('bajo el E2E ni siquiera lo pide', () => {
    expect(claimSingleInstance('/tmp/pastecode-e2e-home')).toBe(true);
    expect(electron.requested).toBe(0);
  });
});
