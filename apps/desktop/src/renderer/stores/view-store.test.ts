import { beforeEach, describe, expect, it } from 'vitest';

import { PANEL_VIEWS, SIDE_VIEWS, useViewStore } from './view-store.js';

beforeEach(() => {
  // El store es de módulo y no tiene provider: sin esto, un test hereda la
  // vista del anterior. Es la consecuencia de ADR-0004 que hay que recordar.
  useViewStore.setState({ sideView: 'explorer', panelView: null });
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
    expect([...PANEL_VIEWS]).toEqual(['terminal']);
  });

  it('arranca con el panel inferior cerrado', () => {
    // Ocupa 18rem de alto y lo que se quiere ver al abrir una carpeta es el
    // código.
    expect(useViewStore.getState().panelView).toBeNull();
  });

  it('abre el panel en la pestaña que se le pide', () => {
    useViewStore.getState().showPanel('terminal');

    expect(useViewStore.getState().panelView).toBe('terminal');
  });

  it('cierra el panel al alternar la pestaña que ya estaba', () => {
    useViewStore.getState().togglePanel('terminal');
    useViewStore.getState().togglePanel('terminal');

    expect(useViewStore.getState().panelView).toBeNull();
  });

  it('cierra el panel sin tocar la vista lateral', () => {
    // Son dos ejes independientes: esconder la terminal no colapsa el árbol.
    useViewStore.getState().showPanel('terminal');
    useViewStore.getState().closePanel();

    expect(useViewStore.getState().panelView).toBeNull();
    expect(useViewStore.getState().sideView).toBe('explorer');
  });
});
