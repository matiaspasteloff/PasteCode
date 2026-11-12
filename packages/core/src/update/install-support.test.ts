import { describe, expect, it } from 'vitest';

import type { InstallContext } from './install-support.js';
import { canInstallInApp } from './install-support.js';

describe('canInstallInApp', () => {
  const cases: readonly (readonly [InstallContext, boolean])[] = [
    [{ platform: 'win32', arch: 'x64', kind: 'nsis' }, true],
    [{ platform: 'linux', arch: 'x64', kind: 'appimage' }, true],
    // Squirrel.Mac exige firma con certificado.
    [{ platform: 'darwin', arch: 'arm64', kind: 'dmg' }, false],
    [{ platform: 'darwin', arch: 'x64', kind: 'dmg' }, false],
    // El `latest.yml` publicado es el de x64.
    [{ platform: 'win32', arch: 'arm64', kind: 'nsis' }, false],
    [{ platform: 'win32', arch: 'x64', kind: 'portable' }, false],
    [{ platform: 'linux', arch: 'x64', kind: 'deb' }, false],
    [{ platform: 'win32', arch: 'x64', kind: 'unpackaged' }, false],
    [{ platform: 'linux', arch: 'x64', kind: 'unpackaged' }, false],
    [{ platform: 'darwin', arch: 'arm64', kind: 'unpackaged' }, false],
  ];

  it.each(cases)('%o → %s', (context, expected) => {
    expect(canInstallInApp(context)).toBe(expected);
  });
});
