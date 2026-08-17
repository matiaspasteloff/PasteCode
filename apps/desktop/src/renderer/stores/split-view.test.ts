import { allOpenPaths, PRIMARY_GROUP_ID, SECONDARY_GROUP_ID } from '@pastecode/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { groupsWith, resetEditorStore } from '../test-support/editor-state.js';
import { installFakeApi } from '../test-support/fake-api.js';

import { selectActiveTabs, useEditorStore } from './editor-store.js';

const A = 'C:\\p\\a.ts';
const B = 'C:\\p\\b.ts';

/** El estado del store, sin repetir el `getState()`. */
function state() {
  return useEditorStore.getState();
}

describe('split view', () => {
  beforeEach(() => {
    resetEditorStore();
    installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'x', mtimeMs: 1 } },
    });
  });

  it('parte la pantalla llevando la pestaña activa al grupo nuevo', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });

    state().splitEditor('horizontal');

    expect(state().groups.groups).toHaveLength(2);
    expect(state().groups.layout).toBe('horizontal');
    expect(selectActiveTabs(state()).tabs.map((tab) => tab.path)).toEqual([A]);
  });

  it('deja el mismo archivo abierto en los dos grupos sin duplicar su modelo', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });

    state().splitEditor('horizontal');

    // **Es el bug número uno de esta feature.** Si `allOpenPaths` repitiera o
    // se calculara por grupo, cerrar la pestaña en uno desecharía el modelo que
    // el otro está mostrando y Monaco tira al siguiente render.
    expect(allOpenPaths(state().groups)).toEqual([A]);
  });

  it('conserva el archivo entre las rutas abiertas al cerrarlo en un solo grupo', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });
    state().splitEditor('horizontal');

    state().closeTab(SECONDARY_GROUP_ID, 0);

    expect(allOpenPaths(state().groups)).toEqual([A]);
  });

  it('vuelve a un solo panel al cerrar la última pestaña del secundario', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });
    state().splitEditor('horizontal');

    state().closeTab(SECONDARY_GROUP_ID, 0);

    expect(state().groups.groups).toHaveLength(1);
    expect(state().groups.layout).toBe('single');
  });

  it('no cierra el grupo primario al quedarse sin pestañas', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });

    state().closeTab(PRIMARY_GROUP_ID, 0);

    expect(state().groups.groups).toHaveLength(1);
  });

  it('marca sucio el archivo en los dos grupos: el modelo es uno solo', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });
    state().splitEditor('horizontal');

    state().markDirty();

    expect(state().groups.groups.map((group) => group.tabs.tabs[0]?.isDirty)).toEqual([
      true,
      true,
    ]);
  });

  it('conserva el mtime del archivo que sigue abierto en el otro grupo', async () => {
    await state().open(A);
    state().splitEditor('horizontal');

    state().closeTab(SECONDARY_GROUP_ID, 0);

    // Perder el `mtime` con una pestaña viva convertiría el próximo guardado en
    // un `STALE_FILE` falso.
    expect(state().mtimes[A]).toBe(1);
  });

  it('olvida el mtime cuando el archivo ya no está abierto en ningún grupo', async () => {
    await state().open(A);

    state().closeTab(PRIMARY_GROUP_ID, 0);

    expect(state().mtimes[A]).toBeUndefined();
  });

  it('abre en el grupo enfocado y no en el primario', async () => {
    useEditorStore.setState({ groups: groupsWith([A]) });
    state().splitEditor('horizontal');

    await state().open(B);

    expect(state().groups.groups[0]?.tabs.tabs.map((tab) => tab.path)).toEqual([A]);
    expect(state().groups.groups[1]?.tabs.tabs.map((tab) => tab.path)).toEqual([A, B]);
  });

  it('mueve el foco entre grupos', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });
    state().splitEditor('horizontal');

    state().focusGroup(PRIMARY_GROUP_ID);

    expect(state().groups.activeGroupId).toBe(PRIMARY_GROUP_ID);
  });

  it('vuelve a un solo grupo al cambiar de workspace', () => {
    useEditorStore.setState({ groups: groupsWith([A]) });
    state().splitEditor('horizontal');

    state().closeAll();

    expect(state().groups.groups).toHaveLength(1);
    expect(state().groups.layout).toBe('single');
  });
});
