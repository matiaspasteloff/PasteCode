import type { Settings } from '@pastecode/core';
import { DEFAULT_SETTINGS } from '@pastecode/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '../../stores/settings-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { viewCommands } from './view-commands.js';

/** Las settings de fábrica, con el zoom que el test necesite. */
function withZoom(zoomLevel: number): Settings {
  return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window, zoomLevel } };
}

/** Ejecuta un comando de `viewCommands` por su id. */
async function run(id: string): Promise<void> {
  const command = viewCommands().find((candidate) => candidate.id === id);

  await command?.handler();
}

describe('comandos de zoom', () => {
  let invoke: ReturnType<typeof installFakeApi>;

  beforeEach(() => {
    useSettingsStore.setState({ settings: withZoom(1), error: null });
    invoke = installFakeApi({
      'settings:update': { ok: true, value: { settings: withZoom(1.5), error: null } },
    });
  });

  it.each([
    ['view.zoomIn', 1.5],
    ['view.zoomOut', 0.5],
    ['view.zoomReset', 0],
  ])('%s escribe window.zoomLevel=%s en las settings del usuario', async (id, expected) => {
    await run(id);

    expect(invoke).toHaveBeenCalledWith('settings:update', {
      scope: 'user',
      settings: { window: { zoomLevel: expected } },
    });
  });

  it('se queda en el máximo del schema', async () => {
    useSettingsStore.setState({ settings: withZoom(5) });

    await run('view.zoomIn');

    expect(invoke).toHaveBeenCalledWith('settings:update', {
      scope: 'user',
      settings: { window: { zoomLevel: 5 } },
    });
  });

  it('deja en el store lo que respondió el main', async () => {
    await run('view.zoomIn');

    expect(useSettingsStore.getState().settings.window.zoomLevel).toBe(1.5);
  });
});
