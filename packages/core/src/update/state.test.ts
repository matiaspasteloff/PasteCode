import { describe, expect, it } from 'vitest';

import type { UpdateEvent, UpdateState } from './state.js';
import { initialUpdateState, reduceUpdateState, releasePageUrl } from './state.js';

const RELEASES = 'https://github.com/matiaspasteloff/PasteCode/releases';

const idle = initialUpdateState('0.3.1', true, true);

describe('initialUpdateState', () => {
  it('arranca en idle cuando la app está empaquetada', () => {
    expect(idle).toEqual({
      status: 'idle',
      currentVersion: '0.3.1',
      availableVersion: null,
      releaseUrl: RELEASES,
      canInstallInApp: true,
    });
  });

  it('arranca en unsupported sin empaquetar', () => {
    expect(initialUpdateState('0.3.1', false, false).status).toBe('unsupported');
  });
});

describe('releasePageUrl', () => {
  it('apunta al tag con la v delante', () => {
    expect(releasePageUrl('0.4.0-beta.1')).toBe(`${RELEASES}/tag/v0.4.0-beta.1`);
  });

  it('cae a la lista de releases sin versión', () => {
    expect(releasePageUrl(null)).toBe(RELEASES);
  });
});

describe('reduceUpdateState', () => {
  const cases: readonly (readonly [string, UpdateEvent, Partial<UpdateState>])[] = [
    ['checking', { type: 'checking' }, { status: 'checking' }],
    [
      'not-available',
      { type: 'not-available' },
      { status: 'up-to-date', availableVersion: null },
    ],
    [
      'available',
      { type: 'available', version: '0.4.0' },
      { status: 'available', availableVersion: '0.4.0', releaseUrl: `${RELEASES}/tag/v0.4.0` },
    ],
    ['progress', { type: 'progress', percent: 42.7 }, { status: 'downloading', percent: 43 }],
    ['progress por encima de 100', { type: 'progress', percent: 130 }, { percent: 100 }],
    ['progress negativo', { type: 'progress', percent: -5 }, { percent: 0 }],
    [
      'downloaded',
      { type: 'downloaded', version: '0.4.0' },
      { status: 'downloaded', availableVersion: '0.4.0' },
    ],
    ['error', { type: 'error', message: 'sin red' }, { status: 'error', message: 'sin red' }],
  ];

  it.each(cases)('%s', (_name, event, expected) => {
    expect(reduceUpdateState(idle, event)).toMatchObject(expected);
  });

  it('conserva la versión nueva mientras descarga', () => {
    const available = reduceUpdateState(idle, { type: 'available', version: '0.4.0' });
    const downloading = reduceUpdateState(available, { type: 'progress', percent: 10 });

    expect(downloading.availableVersion).toBe('0.4.0');
    expect(downloading.canInstallInApp).toBe(true);
  });

  it('no sale de unsupported con ningún evento', () => {
    const unsupported = initialUpdateState('0.3.1', false, false);

    expect(reduceUpdateState(unsupported, { type: 'available', version: '9.9.9' })).toBe(
      unsupported
    );
  });

  it('no muta el estado anterior', () => {
    const before = { ...idle };

    reduceUpdateState(idle, { type: 'available', version: '0.4.0' });

    expect(idle).toEqual(before);
  });
});
