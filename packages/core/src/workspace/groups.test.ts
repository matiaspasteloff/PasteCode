import { describe, expect, it } from 'vitest';

import type { GroupsState } from './groups.js';
import {
  activeGroup,
  activeTabs,
  allOpenPaths,
  closeGroup,
  focusGroup,
  groupsFromTabs,
  PRIMARY_GROUP_ID,
  SECONDARY_GROUP_ID,
  SINGLE_EMPTY_GROUPS,
  splitGroups,
  updateActiveGroup,
  updateGroup,
} from './groups.js';
import { closeTab, openTab } from './tabs.js';

const A = 'C:\\p\\a.ts';
const B = 'C:\\p\\b.ts';

/** Un solo grupo con estas rutas abiertas, la última activa. */
function withTabs(...paths: readonly string[]): GroupsState {
  return paths.reduce(
    (state, path) => updateActiveGroup(state, (tabs) => openTab(tabs, path)),
    SINGLE_EMPTY_GROUPS
  );
}

describe('activeGroup y activeTabs', () => {
  it('arranca con un solo grupo vacío y enfocado', () => {
    expect(activeGroup(SINGLE_EMPTY_GROUPS).id).toBe(PRIMARY_GROUP_ID);
    expect(activeTabs(SINGLE_EMPTY_GROUPS).tabs).toEqual([]);
  });

  it('devuelve el primero si el id activo apunta a uno que ya no está', () => {
    const broken: GroupsState = { ...SINGLE_EMPTY_GROUPS, activeGroupId: 'no-existe' };

    expect(activeGroup(broken).id).toBe(PRIMARY_GROUP_ID);
  });
});

describe('updateGroup', () => {
  it('cambia sólo las pestañas del grupo que se le pide', () => {
    const split = splitGroups(withTabs(A), 'horizontal');
    const updated = updateGroup(split, PRIMARY_GROUP_ID, (tabs) => openTab(tabs, B));

    expect(updated.groups[0]?.tabs.tabs.map((tab) => tab.path)).toEqual([A, B]);
    expect(updated.groups[1]?.tabs.tabs.map((tab) => tab.path)).toEqual([A]);
  });

  it('no hace nada con un grupo que no existe', () => {
    const state = withTabs(A);

    expect(updateGroup(state, 'no-existe', (tabs) => closeTab(tabs, 0))).toBe(state);
  });
});

describe('splitGroups', () => {
  it('crea el segundo grupo con la pestaña activa y le da el foco', () => {
    const split = splitGroups(withTabs(A, B), 'horizontal');

    expect(split.groups).toHaveLength(2);
    expect(split.activeGroupId).toBe(SECONDARY_GROUP_ID);
    expect(activeTabs(split).tabs.map((tab) => tab.path)).toEqual([B]);
  });

  it('deja las pestañas del grupo de origen intactas', () => {
    const split = splitGroups(withTabs(A, B), 'vertical');

    expect(split.groups[0]?.tabs.tabs.map((tab) => tab.path)).toEqual([A, B]);
  });

  it('guarda la orientación pedida', () => {
    expect(splitGroups(withTabs(A), 'vertical').layout).toBe('vertical');
  });

  it('parte sin pestañas abiertas: el grupo nuevo queda vacío', () => {
    const split = splitGroups(SINGLE_EMPTY_GROUPS, 'horizontal');

    expect(split.groups).toHaveLength(2);
    expect(activeTabs(split).tabs).toEqual([]);
  });

  it('no crea un tercer grupo: manda la pestaña al otro y cambia la orientación', () => {
    const split = splitGroups(withTabs(A), 'horizontal');
    const again = splitGroups(
      updateActiveGroup(split, (tabs) => openTab(tabs, B)),
      'vertical'
    );

    expect(again.groups).toHaveLength(2);
    expect(again.layout).toBe('vertical');
    expect(again.activeGroupId).toBe(PRIMARY_GROUP_ID);
    expect(again.groups[0]?.tabs.tabs.map((tab) => tab.path)).toEqual([A, B]);
  });
});

describe('closeGroup', () => {
  it('vuelve a un solo panel', () => {
    const closed = closeGroup(splitGroups(withTabs(A), 'horizontal'), SECONDARY_GROUP_ID);

    expect(closed.groups).toHaveLength(1);
    expect(closed.layout).toBe('single');
    expect(closed.activeGroupId).toBe(PRIMARY_GROUP_ID);
  });

  it('nunca cierra el último grupo', () => {
    expect(closeGroup(SINGLE_EMPTY_GROUPS, PRIMARY_GROUP_ID)).toBe(SINGLE_EMPTY_GROUPS);
  });
});

describe('focusGroup', () => {
  it('mueve el foco', () => {
    const split = splitGroups(withTabs(A), 'horizontal');

    expect(focusGroup(split, PRIMARY_GROUP_ID).activeGroupId).toBe(PRIMARY_GROUP_ID);
  });

  it('ignora un grupo que no existe', () => {
    const state = withTabs(A);

    expect(focusGroup(state, SECONDARY_GROUP_ID)).toBe(state);
  });
});

describe('allOpenPaths', () => {
  it('junta las rutas de todos los grupos', () => {
    const split = splitGroups(withTabs(A), 'horizontal');
    const withB = updateActiveGroup(split, (tabs) => openTab(tabs, B));

    expect(allOpenPaths(withB).toSorted()).toEqual([A, B].toSorted());
  });

  it('no repite el archivo que está abierto en los dos grupos', () => {
    // Es exactamente el caso que hace que liberar modelos por grupo rompa: el
    // mismo modelo lo comparten los dos paneles.
    expect(allOpenPaths(splitGroups(withTabs(A), 'horizontal'))).toEqual([A]);
  });

  it('devuelve una lista vacía sin nada abierto', () => {
    expect(allOpenPaths(SINGLE_EMPTY_GROUPS)).toEqual([]);
  });
});

describe('groupsFromTabs', () => {
  it('arma un solo grupo, que es cómo se lee una sesión vieja', () => {
    const restored = groupsFromTabs({
      tabs: [{ path: A, isDirty: false, isPinned: false }],
      activeTabIndex: 0,
    });

    expect(restored.layout).toBe('single');
    expect(restored.groups).toHaveLength(1);
    expect(activeTabs(restored).tabs.map((tab) => tab.path)).toEqual([A]);
  });
});
