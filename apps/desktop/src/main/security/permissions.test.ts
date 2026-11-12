import { describe, expect, it } from 'vitest';

import type { PermissionSession } from './permissions.js';
import { applyPermissionPolicy, isPermissionAllowed } from './permissions.js';

const APP_ORIGIN = 'pastecode://app';
const DEV_ORIGIN = 'http://localhost:5173';

describe('isPermissionAllowed', () => {
  it.each([
    ['permitido + origen propio', 'clipboard-read', 'pastecode://app/', undefined, true],
    [
      'permitido + URL del origen propio',
      'clipboard-sanitized-write',
      'pastecode://app/index.html',
      undefined,
      true,
    ],
    ['permitido + origen ajeno', 'clipboard-read', 'https://evil.test/', undefined, false],
    [
      'permitido + otro host del esquema propio',
      'clipboard-read',
      'pastecode://otro/',
      undefined,
      false,
    ],
    ['permitido + file://', 'clipboard-read', 'file:///c:/index.html', undefined, false],
    ['no listado + origen propio', 'geolocation', 'pastecode://app/', undefined, false],
    ['no listado + origen propio', 'media', 'pastecode://app/', undefined, false],
    ['no listado + origen propio', 'notifications', 'pastecode://app/', undefined, false],
    ['permitido + origen undefined', 'clipboard-read', undefined, undefined, false],
    ['permitido + origen vacío', 'clipboard-read', '', undefined, false],
    [
      'permitido + dev server en producción',
      'clipboard-read',
      `${DEV_ORIGIN}/`,
      undefined,
      false,
    ],
    [
      'permitido + dev server en desarrollo',
      'clipboard-read',
      `${DEV_ORIGIN}/`,
      DEV_ORIGIN,
      true,
    ],
    [
      'no listado + dev server en desarrollo',
      'geolocation',
      `${DEV_ORIGIN}/`,
      DEV_ORIGIN,
      false,
    ],
  ])('%s (%s) → %s', (_case, permission, origin, devServerOrigin, expected) => {
    expect(isPermissionAllowed(permission, origin, APP_ORIGIN, devServerOrigin)).toBe(expected);
  });
});

/** Una sesión falsa que guarda los handlers para poder llamarlos a mano. */
function fakeSession(): {
  session: PermissionSession;
  request: (permission: string, requestingUrl: string) => boolean | undefined;
  check: (permission: string, requestingOrigin: string) => boolean | undefined;
  device: () => boolean | undefined;
} {
  let requestHandler:
    Parameters<PermissionSession['setPermissionRequestHandler']>[0] | undefined;
  let checkHandler: Parameters<PermissionSession['setPermissionCheckHandler']>[0] | undefined;
  let deviceHandler: Parameters<PermissionSession['setDevicePermissionHandler']>[0] | undefined;

  return {
    session: {
      setPermissionRequestHandler: (handler) => {
        requestHandler = handler;
      },
      setPermissionCheckHandler: (handler) => {
        checkHandler = handler;
      },
      setDevicePermissionHandler: (handler) => {
        deviceHandler = handler;
      },
    },
    request: (permission, requestingUrl) => {
      let granted: boolean | undefined;
      requestHandler?.(null, permission, (value) => (granted = value), { requestingUrl });
      return granted;
    },
    check: (permission, requestingOrigin) => checkHandler?.(null, permission, requestingOrigin),
    device: () => deviceHandler?.(),
  };
}

describe('applyPermissionPolicy', () => {
  it('instala los tres handlers y contesta con la misma regla', () => {
    const fake = fakeSession();
    applyPermissionPolicy(fake.session, APP_ORIGIN, undefined);

    expect(fake.request('clipboard-read', 'pastecode://app/index.html')).toBe(true);
    expect(fake.request('media', 'pastecode://app/index.html')).toBe(false);
    expect(fake.check('clipboard-read', 'pastecode://app')).toBe(true);
    expect(fake.check('geolocation', 'pastecode://app')).toBe(false);
    expect(fake.check('clipboard-read', 'https://evil.test')).toBe(false);
  });

  it('niega siempre los dispositivos', () => {
    const fake = fakeSession();
    applyPermissionPolicy(fake.session, APP_ORIGIN, DEV_ORIGIN);

    expect(fake.device()).toBe(false);
  });
});
