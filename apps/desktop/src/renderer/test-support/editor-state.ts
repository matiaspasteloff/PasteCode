import type { TabsState } from '@pastecode/core';
import { NO_TABS } from '@pastecode/core';

import { useEditorStore } from '../stores/editor-store.js';

/**
 * Deja el store del editor como recién arrancado.
 *
 * Hace falta en cada test porque el store es de módulo y no tiene provider:
 * sin esto, un test hereda las pestañas del anterior. Es la consecuencia de
 * [ADR-0004](../../../../../docs/adr/0004-zustand-para-el-estado-del-renderer.md)
 * que hay que recordar.
 *
 * @example
 * beforeEach(() => { resetEditorStore(); });
 */
export function resetEditorStore(): void {
  useEditorStore.setState({
    tabs: NO_TABS,
    mtimes: {},
    pendingFile: null,
    isLoading: false,
    isSaving: false,
    error: null,
    conflict: null,
    readContent: null,
  });
}

/**
 * Arma un `TabsState` a partir de rutas, con la primera activa por defecto.
 *
 * @param paths Rutas de las pestañas abiertas.
 * @param activeTabIndex Índice de la activa.
 * @returns El estado listo para `setState`.
 * @example
 * useEditorStore.setState({ tabs: tabsWith(['C:\\p\\a.ts']) });
 */
export function tabsWith(paths: readonly string[], activeTabIndex = 0): TabsState {
  return {
    tabs: paths.map((path) => ({ path, isDirty: false, isPinned: false })),
    activeTabIndex,
  };
}
