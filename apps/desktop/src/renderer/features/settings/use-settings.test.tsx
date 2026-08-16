import { DEFAULT_SETTINGS } from '@pastecode/core';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '../../stores/settings-store.js';
import { useThemeStore } from '../../stores/theme-store.js';
import { emitFakeEvent, installFakeApi } from '../../test-support/fake-api.js';

import { useSettings } from './use-settings.js';

/** Unas settings resueltas con un par de valores cambiados. */
function settingsWith(overrides: { fontSize?: number; theme?: 'light' | 'dark' | 'system' }) {
  return {
    ...DEFAULT_SETTINGS,
    editor: { ...DEFAULT_SETTINGS.editor, fontSize: overrides.fontSize ?? 14 },
    window: { ...DEFAULT_SETTINGS.window, theme: overrides.theme ?? 'system' },
  };
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, error: null });
  useThemeStore.setState({ theme: 'system' });
});

describe('useSettings', () => {
  it('pide las settings al montar', async () => {
    const invoke = installFakeApi({
      'settings:get': {
        ok: true,
        value: { settings: settingsWith({ fontSize: 20 }), error: null },
      },
    });

    renderHook(() => {
      useSettings();
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().settings.editor.fontSize).toBe(20);
    });
    expect(invoke).toHaveBeenCalledWith('settings:get', {});
  });

  it('aplica lo que llega por settings:changed', async () => {
    installFakeApi({
      'settings:get': { ok: true, value: { settings: DEFAULT_SETTINGS, error: null } },
    });

    renderHook(() => {
      useSettings();
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
    });

    // RF-704: es la recarga en caliente vista desde el renderer.
    emitFakeEvent('settings:changed', {
      settings: settingsWith({ fontSize: 26 }),
      error: null,
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().settings.editor.fontSize).toBe(26);
    });
  });

  it('guarda el error de un archivo roto sin perder las settings buenas', async () => {
    installFakeApi({
      'settings:get': {
        ok: true,
        value: { settings: settingsWith({ fontSize: 22 }), error: null },
      },
    });

    renderHook(() => {
      useSettings();
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings.editor.fontSize).toBe(22);
    });

    emitFakeEvent('settings:changed', {
      settings: settingsWith({ fontSize: 22 }),
      error: { code: 'INVALID_SETTINGS_FILE', userMessage: 'El archivo tiene un error.' },
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().error?.code).toBe('INVALID_SETTINGS_FILE');
    });
    // RNF-25: se muestra el problema y se sigue trabajando.
    expect(useSettingsStore.getState().settings.editor.fontSize).toBe(22);
  });

  it('window.theme pasa a ser la fuente del tema', async () => {
    installFakeApi({
      'settings:get': {
        ok: true,
        value: { settings: settingsWith({ theme: 'dark' }), error: null },
      },
    });

    renderHook(() => {
      useSettings();
    });

    await waitFor(() => {
      expect(useThemeStore.getState().theme).toBe('dark');
    });
  });

  it('se desuscribe al desmontarse', async () => {
    installFakeApi({
      'settings:get': { ok: true, value: { settings: DEFAULT_SETTINGS, error: null } },
    });

    const { unmount } = renderHook(() => {
      useSettings();
    });
    await waitFor(() => {
      expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
    });

    unmount();

    expect(() => {
      emitFakeEvent('settings:changed', { settings: DEFAULT_SETTINGS, error: null });
    }).toThrow('Nadie está suscripto');
  });
});
