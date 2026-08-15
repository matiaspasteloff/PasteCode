import { describe, expect, it } from 'vitest';

import {
  activateTab,
  activeTab,
  closeTab,
  moveTab,
  NO_TABS,
  openTab,
  setTabDirty,
  type TabsState,
} from './tabs.js';

/** Construye un estado con las rutas dadas y la activa indicada. */
function stateWith(paths: readonly string[], activeTabIndex: number): TabsState {
  return {
    tabs: paths.map((path) => ({ path, isDirty: false, isPinned: false })),
    activeTabIndex,
  };
}

/** Los nombres de las pestañas, para que las aserciones se lean. */
function pathsOf(state: TabsState): string[] {
  return state.tabs.map((tab) => tab.path);
}

describe('openTab', () => {
  it('abre la primera pestaña y la activa', () => {
    const state = openTab(NO_TABS, 'a');

    expect(pathsOf(state)).toEqual(['a']);
    expect(state.activeTabIndex).toBe(0);
  });

  it('agrega al final y activa la nueva', () => {
    const state = openTab(stateWith(['a', 'b'], 0), 'c');

    expect(pathsOf(state)).toEqual(['a', 'b', 'c']);
    expect(state.activeTabIndex).toBe(2);
  });

  it('activa la existente en vez de duplicarla', () => {
    // Es lo que espera cualquiera que hace doble click en el árbol, y evita
    // dos pestañas del mismo archivo pisándose el contenido.
    const state = openTab(stateWith(['a', 'b', 'c'], 2), 'b');

    expect(pathsOf(state)).toEqual(['a', 'b', 'c']);
    expect(state.activeTabIndex).toBe(1);
  });

  it('conserva el estado sucio de la pestaña que reactiva', () => {
    const dirty: TabsState = {
      tabs: [{ path: 'a', isDirty: true, isPinned: false }],
      activeTabIndex: 0,
    };

    expect(openTab(dirty, 'a').tabs[0]?.isDirty).toBe(true);
  });
});

describe('closeTab', () => {
  it('deja el estado vacío al cerrar la última', () => {
    const state = closeTab(stateWith(['a'], 0), 0);

    expect(state).toEqual(NO_TABS);
    expect(state.activeTabIndex).toBe(-1);
  });

  it('al cerrar la activa deja la de la derecha', () => {
    const state = closeTab(stateWith(['a', 'b', 'c'], 1), 1);

    expect(pathsOf(state)).toEqual(['a', 'c']);
    expect(activeTab(state)?.path).toBe('c');
  });

  it('al cerrar la activa que era la última deja la de la izquierda', () => {
    const state = closeTab(stateWith(['a', 'b', 'c'], 2), 2);

    expect(activeTab(state)?.path).toBe('b');
  });

  it('al cerrar una de la izquierda conserva la activa', () => {
    const state = closeTab(stateWith(['a', 'b', 'c'], 2), 0);

    expect(activeTab(state)?.path).toBe('c');
    expect(state.activeTabIndex).toBe(1);
  });

  it('al cerrar una de la derecha conserva la activa y su índice', () => {
    const state = closeTab(stateWith(['a', 'b', 'c'], 0), 2);

    expect(activeTab(state)?.path).toBe('a');
    expect(state.activeTabIndex).toBe(0);
  });

  it.each([-1, 3])('ignora el índice inexistente %i', (index) => {
    const original = stateWith(['a', 'b', 'c'], 1);

    expect(closeTab(original, index)).toBe(original);
  });
});

describe('activateTab', () => {
  it('activa la pestaña del índice', () => {
    expect(activateTab(stateWith(['a', 'b'], 0), 1).activeTabIndex).toBe(1);
  });

  it.each([-1, 2])('ignora el índice inexistente %i', (index) => {
    const original = stateWith(['a', 'b'], 0);

    expect(activateTab(original, index)).toBe(original);
  });
});

describe('moveTab', () => {
  it('mueve la pestaña de lugar', () => {
    expect(pathsOf(moveTab(stateWith(['a', 'b', 'c'], 0), 0, 2))).toEqual(['b', 'c', 'a']);
  });

  it('sigue a la pestaña activa aunque cambie de índice', () => {
    // Lo que la persona espera es seguir viendo el archivo que estaba viendo,
    // no que se le cambie el contenido por reordenar.
    const state = moveTab(stateWith(['a', 'b', 'c'], 0), 0, 2);

    expect(activeTab(state)?.path).toBe('a');
    expect(state.activeTabIndex).toBe(2);
  });

  it('actualiza el índice activo cuando se mueve otra pestaña', () => {
    const state = moveTab(stateWith(['a', 'b', 'c'], 2), 0, 1);

    expect(activeTab(state)?.path).toBe('c');
  });

  it('no hace nada si el origen y el destino son el mismo', () => {
    const original = stateWith(['a', 'b'], 0);

    expect(moveTab(original, 1, 1)).toBe(original);
  });

  it.each([
    [-1, 1],
    [0, 5],
  ])('ignora los índices inexistentes (%i, %i)', (from, to) => {
    const original = stateWith(['a', 'b'], 0);

    expect(moveTab(original, from, to)).toBe(original);
  });
});

describe('setTabDirty', () => {
  it('marca sólo la pestaña indicada', () => {
    const state = setTabDirty(stateWith(['a', 'b'], 0), 'b', true);

    expect(state.tabs.map((tab) => tab.isDirty)).toEqual([false, true]);
  });

  it('desmarca al guardar', () => {
    const dirty = setTabDirty(stateWith(['a'], 0), 'a', true);

    expect(setTabDirty(dirty, 'a', false).tabs[0]?.isDirty).toBe(false);
  });

  it('ignora una ruta que no está abierta', () => {
    const state = setTabDirty(stateWith(['a'], 0), 'z', true);

    expect(state.tabs[0]?.isDirty).toBe(false);
  });
});

describe('activeTab', () => {
  it('devuelve undefined cuando no hay ninguna', () => {
    expect(activeTab(NO_TABS)).toBeUndefined();
  });

  it('devuelve la pestaña del índice activo', () => {
    expect(activeTab(stateWith(['a', 'b'], 1))?.path).toBe('b');
  });
});
