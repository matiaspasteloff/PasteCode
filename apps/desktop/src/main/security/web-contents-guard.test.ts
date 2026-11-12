import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuardedWebContents } from './web-contents-guard.js';

/**
 * `app` y `shell` falsos: lo que se testea es que la guarda se enganche a
 * `web-contents-created` y que lo que manda al navegador pase por `shell`.
 */
const electron = vi.hoisted(
  (): {
    createdListeners: ((event: unknown, contents: GuardedWebContents) => void)[];
    opened: string[];
  } => ({ createdListeners: [], opened: [] })
);

vi.mock('electron', () => ({
  app: {
    on: (_event: string, listener: (event: unknown, contents: GuardedWebContents) => void) => {
      electron.createdListeners.push(listener);
    },
  },
  shell: {
    openExternal: (url: string): Promise<void> => {
      electron.opened.push(url);
      return Promise.resolve();
    },
  },
}));

const { guardWebContents, installWebContentsGuard } = await import('./web-contents-guard.js');

const APP_ORIGIN = 'pastecode://app';
const DEV_ORIGIN = 'http://localhost:5173';

type Listener = (event: { url: string; preventDefault(): void }) => void;

/** Un `webContents` falso que guarda los listeners para dispararlos a mano. */
function fakeContents(): {
  contents: GuardedWebContents;
  emit: (name: string, url?: string) => boolean;
  open: (url: string) => { action: 'deny' } | undefined;
} {
  const listeners = new Map<string, Listener>();
  let openHandler: ((details: { readonly url: string }) => { action: 'deny' }) | undefined;

  return {
    contents: {
      on: (name: string, listener: Listener) => {
        listeners.set(name, listener);
      },
      setWindowOpenHandler: (handler) => {
        openHandler = handler;
      },
    },
    /** Dispara el evento y devuelve si quedó cancelado. */
    emit: (name, url = '') => {
      let prevented = false;
      listeners.get(name)?.({
        url,
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    },
    open: (url) => openHandler?.({ url }),
  };
}

describe('guardWebContents', () => {
  let fake: ReturnType<typeof fakeContents>;
  let opened: string[];

  beforeEach(() => {
    fake = fakeContents();
    opened = [];
    guardWebContents(fake.contents, APP_ORIGIN, undefined, (url) => opened.push(url));
  });

  it('impide siempre adjuntar un <webview>', () => {
    expect(fake.emit('will-attach-webview')).toBe(true);
  });

  it.each(['will-navigate', 'will-redirect'])('%s: deja pasar el origen de la app', (name) => {
    expect(fake.emit(name, `${APP_ORIGIN}/index.html`)).toBe(false);
  });

  it.each([
    ['will-navigate', 'https://example.com/'],
    ['will-navigate', 'file:///c:/windows/win.ini'],
    ['will-redirect', 'https://example.com/'],
    ['will-redirect', `${DEV_ORIGIN}/`],
    ['will-navigate', 'no es una url'],
  ])('%s: cancela %s', (name, url) => {
    expect(fake.emit(name, url)).toBe(true);
  });

  it('niega toda ventana nueva y manda al navegador sólo lo https', () => {
    expect(fake.open('https://example.com/')).toEqual({ action: 'deny' });
    expect(fake.open('file:///c:/windows/win.ini')).toEqual({ action: 'deny' });
    expect(fake.open('javascript:alert(1)')).toEqual({ action: 'deny' });

    expect(opened).toEqual(['https://example.com/']);
  });

  it('en desarrollo deja navegar al dev server', () => {
    const dev = fakeContents();
    guardWebContents(dev.contents, APP_ORIGIN, DEV_ORIGIN, () => undefined);

    expect(dev.emit('will-navigate', `${DEV_ORIGIN}/index.html`)).toBe(false);
    expect(dev.emit('will-navigate', 'https://example.com/')).toBe(true);
  });
});

describe('installWebContentsGuard', () => {
  it('protege todo webContents que se cree y abre afuera con shell', () => {
    installWebContentsGuard(APP_ORIGIN, undefined);

    const created = fakeContents();
    for (const listener of electron.createdListeners) listener({}, created.contents);

    expect(created.emit('will-navigate', 'https://example.com/')).toBe(true);
    expect(created.open('https://example.com/docs')).toEqual({ action: 'deny' });
    expect(electron.opened).toEqual(['https://example.com/docs']);
  });
});
