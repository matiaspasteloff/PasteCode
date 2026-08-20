import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useDebugStore } from './debug-store.js';

const A = 'C:\\p\\a.ts';
const B = 'C:\\p\\b.ts';

beforeEach(() => {
  // Poner un breakpoint le avisa al main en el acto: sin el canal, cada
  // `toggle` dejaría una promesa rechazada suelta.
  installFakeApi({ 'debug:setBreakpoints': { ok: true, value: {} } });

  useDebugStore.getState().clear();
});

describe('useDebugStore', () => {
  it('arranca sin breakpoints', () => {
    expect(useDebugStore.getState().breakpoints).toEqual([]);
  });

  it('pone y saca con el mismo click', () => {
    const { toggle } = useDebugStore.getState();

    toggle(A, 12);
    expect(useDebugStore.getState().breakpoints).toHaveLength(1);

    toggle(A, 12);
    expect(useDebugStore.getState().breakpoints).toEqual([]);
  });

  it('conserva los de otros archivos', () => {
    const { toggle } = useDebugStore.getState();

    toggle(A, 12);
    toggle(B, 3);
    toggle(A, 12);

    expect(useDebugStore.getState().breakpoints).toEqual([{ path: B, line: 3, enabled: true }]);
  });

  it('reemplaza la lista entera al restaurar una sesión', () => {
    const restored = [{ path: A, line: 5, enabled: true }];

    useDebugStore.getState().toggle(B, 1);
    useDebugStore.getState().setBreakpoints(restored);

    expect(useDebugStore.getState().breakpoints).toEqual(restored);
  });

  it('copia lo que le pasan al restaurar', () => {
    // El array llega del IPC y quien lo mandó puede seguir usándolo; guardarlo
    // por referencia dejaría al store atado a algo que no controla.
    const restored = [{ path: A, line: 5, enabled: true }];

    useDebugStore.getState().setBreakpoints(restored);

    expect(useDebugStore.getState().breakpoints).not.toBe(restored);
  });

  it('clear los saca todos', () => {
    useDebugStore.getState().toggle(A, 1);
    useDebugStore.getState().clear();

    expect(useDebugStore.getState().breakpoints).toEqual([]);
  });
});
