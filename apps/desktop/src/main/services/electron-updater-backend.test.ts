import { EventEmitter } from 'node:events';

import type { UpdateEvent } from '@pastecode/core';
import { describe, expect, it, vi } from 'vitest';

import type { AutoUpdaterLike } from './electron-updater-backend.js';
import { createElectronUpdaterBackend, detectInstallKind } from './electron-updater-backend.js';

/** Un `autoUpdater` falso: un emisor con los defaults de electron-updater. */
function fakeAutoUpdater() {
  const emitter = new EventEmitter();
  const updater = Object.assign(emitter, {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    downloadUpdate: vi.fn(() => Promise.resolve([])),
    quitAndInstall: vi.fn(),
  }) satisfies AutoUpdaterLike;
  return updater;
}

describe('createElectronUpdaterBackend', () => {
  it('apaga la descarga y la instalación automáticas', () => {
    const updater = fakeAutoUpdater();

    createElectronUpdaterBackend(updater);

    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it('traduce cada evento de electron-updater', () => {
    const updater = fakeAutoUpdater();
    const events: UpdateEvent[] = [];
    createElectronUpdaterBackend(updater).onEvent((event) => events.push(event));

    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '0.4.0' });
    updater.emit('download-progress', { percent: 12.5 });
    updater.emit('update-downloaded', { version: '0.4.0' });
    updater.emit('update-not-available', { version: '0.3.1' });
    updater.emit('error', new Error('sin red'));

    expect(events).toEqual([
      { type: 'checking' },
      { type: 'available', version: '0.4.0' },
      { type: 'progress', percent: 12.5 },
      { type: 'downloaded', version: '0.4.0' },
      { type: 'not-available' },
      { type: 'error', message: 'sin red' },
    ]);
  });

  it('pasa cada acción al método que corresponde', async () => {
    const updater = fakeAutoUpdater();
    const backend = createElectronUpdaterBackend(updater);

    backend.setAllowPrerelease(true);
    await backend.check();
    await backend.download();
    backend.install();

    expect(updater.allowPrerelease).toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe('detectInstallKind', () => {
  it.each([
    ['win32', false, {}, 'unpackaged'],
    ['win32', true, {}, 'nsis'],
    ['win32', true, { PORTABLE_EXECUTABLE_DIR: 'C:\\x' }, 'portable'],
    ['darwin', true, {}, 'dmg'],
    ['linux', true, { APPIMAGE: '/a/PasteCode.AppImage' }, 'appimage'],
    ['linux', true, {}, 'deb'],
  ] as const)('%s, empaquetada %s, %o → %s', (platform, packaged, env, expected) => {
    expect(detectInstallKind(platform, packaged, env)).toBe(expected);
  });
});
