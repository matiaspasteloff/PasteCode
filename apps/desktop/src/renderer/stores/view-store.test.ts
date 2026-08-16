import { beforeEach, describe, expect, it } from 'vitest';

import { SIDE_VIEWS, useViewStore } from './view-store.js';

beforeEach(() => {
  // El store es de módulo y no tiene provider: sin esto, un test hereda la
  // vista del anterior. Es la consecuencia de ADR-0004 que hay que recordar.
  useViewStore.setState({ sideView: 'explorer' });
});

describe('useViewStore', () => {
  it('arranca con el explorador abierto', () => {
    // Arrancar colapsado obliga a un click antes de poder ver nada.
    expect(useViewStore.getState().sideView).toBe('explorer');
  });

  it('muestra la vista que se le pide', () => {
    useViewStore.getState().showSide('search');

    expect(useViewStore.getState().sideView).toBe('search');
  });

  it('deja la vista abierta si ya lo estaba', () => {
    useViewStore.getState().showSide('explorer');

    expect(useViewStore.getState().sideView).toBe('explorer');
  });

  it('colapsa la barra si se alterna la vista que ya estaba', () => {
    // Es lo que hace que el mismo atajo sirva para ir y para volver.
    useViewStore.getState().toggleSide('explorer');

    expect(useViewStore.getState().sideView).toBeNull();
  });

  it('cambia de vista al alternar una distinta de la activa', () => {
    useViewStore.getState().toggleSide('search');

    expect(useViewStore.getState().sideView).toBe('search');
  });

  it('reabre la vista después de haber colapsado', () => {
    useViewStore.getState().toggleSide('explorer');
    useViewStore.getState().toggleSide('explorer');

    expect(useViewStore.getState().sideView).toBe('explorer');
  });

  it('declara las vistas como dato recorrible y no como enum', () => {
    // La lista tiene que poder recorrerse: es lo que dibuja el rail.
    expect([...SIDE_VIEWS]).toEqual(['explorer', 'search']);
  });
});
