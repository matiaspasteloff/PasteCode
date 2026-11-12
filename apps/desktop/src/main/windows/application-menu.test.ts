import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Lo que recibió `Menu.setApplicationMenu`, y con qué plantilla se armó. */
const menu = vi.hoisted((): { applied: unknown[]; templates: unknown[][] } => ({
  applied: [],
  templates: [],
}));

vi.mock('electron', () => ({
  Menu: {
    setApplicationMenu: (value: unknown): void => {
      menu.applied.push(value);
    },
    buildFromTemplate: (template: unknown[]): string => {
      menu.templates.push(template);
      return 'menú armado';
    },
  },
}));

const { applyApplicationMenu, chooseApplicationMenu } = await import('./application-menu.js');

describe('chooseApplicationMenu', () => {
  it.each([
    ['win32', false, 'none'],
    ['linux', false, 'none'],
    ['darwin', false, 'mac-minimal'],
    ['win32', true, 'electron-default'],
    ['linux', true, 'electron-default'],
    ['darwin', true, 'electron-default'],
  ] as const)('%s, desarrollo=%s → %s', (platform, isDevelopment, expected) => {
    expect(chooseApplicationMenu(platform, isDevelopment)).toBe(expected);
  });
});

describe('applyApplicationMenu', () => {
  beforeEach(() => {
    menu.applied = [];
    menu.templates = [];
  });

  it('saca el menú en Windows y Linux empaquetados', () => {
    applyApplicationMenu('win32', false);

    expect(menu.applied).toEqual([null]);
  });

  it('en macOS instala sólo appMenu, editMenu y windowMenu', () => {
    applyApplicationMenu('darwin', false);

    expect(menu.templates).toEqual([
      [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }],
    ]);
    expect(menu.applied).toEqual(['menú armado']);
  });

  it('en desarrollo no toca el menú de Electron', () => {
    applyApplicationMenu('linux', true);

    expect(menu.applied).toEqual([]);
  });
});
