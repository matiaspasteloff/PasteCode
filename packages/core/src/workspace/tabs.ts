/**
 * Una pestaña abierta.
 *
 * Es el `TabState` del [modelo de datos](../../../../docs/05-modelo-de-datos.md#estado-del-workspace),
 * recortado a lo que la Etapa 2 usa. `cursorPosition` y `scrollTopLine` no
 * viven acá sino en el view state que guarda Monaco: duplicarlos sería tener
 * dos fuentes de verdad para lo mismo.
 */
export interface TabState {
  /** Ruta absoluta del archivo. Es la identidad de la pestaña. */
  path: string;
  isDirty: boolean;
  /** Si está anclada. No se cierra con "cerrar todas". */
  isPinned: boolean;
}

/** Las pestañas abiertas y cuál está activa. */
export interface TabsState {
  tabs: readonly TabState[];
  /** Índice de la activa. **-1 si no hay ninguna**, como manda el modelo. */
  activeTabIndex: number;
}

/** Sin pestañas abiertas. */
export const NO_TABS: TabsState = { tabs: [], activeTabIndex: -1 };

/**
 * Abre un archivo en una pestaña, o activa la que ya lo tenía.
 *
 * Reabrir lo que ya está abierto **no duplica la pestaña**: es lo que espera
 * cualquiera que hace doble click en el árbol, y evita dos pestañas del mismo
 * archivo con contenidos que se pisan.
 *
 * @param state Estado actual.
 * @param path Ruta absoluta del archivo.
 * @returns El estado nuevo.
 * @example
 * openTab(NO_TABS, 'C:\\p\\a.ts'); // una pestaña, activa
 */
export function openTab(state: TabsState, path: string): TabsState {
  const existing = state.tabs.findIndex((tab) => tab.path === path);
  if (existing !== -1) return { ...state, activeTabIndex: existing };

  return {
    tabs: [...state.tabs, { path, isDirty: false, isPinned: false }],
    activeTabIndex: state.tabs.length,
  };
}

/**
 * Cierra la pestaña de un índice y decide cuál queda activa.
 *
 * Al cerrar la activa queda la de la derecha, y si no había, la de la
 * izquierda. Es lo que hacen todos los editores, y lo contrario —volver
 * siempre a la primera— desorienta.
 *
 * @param state Estado actual.
 * @param index Índice a cerrar.
 * @returns El estado nuevo, o el mismo si el índice no existe.
 * @example
 * closeTab({ tabs: [a, b, c], activeTabIndex: 1 }, 1).activeTabIndex; // 1, ahora c
 */
export function closeTab(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length) return state;

  const tabs = state.tabs.filter((_tab, position) => position !== index);
  if (tabs.length === 0) return NO_TABS;

  return { tabs, activeTabIndex: nextActiveIndex(state.activeTabIndex, index, tabs.length) };
}

/**
 * Activa una pestaña por índice.
 *
 * @param state Estado actual.
 * @param index Índice a activar.
 * @returns El estado nuevo, o el mismo si el índice no existe.
 * @example
 * activateTab(state, 2);
 */
export function activateTab(state: TabsState, index: number): TabsState {
  if (index < 0 || index >= state.tabs.length) return state;

  return { ...state, activeTabIndex: index };
}

/**
 * Mueve una pestaña de posición, conservando cuál estaba activa.
 *
 * "Conservando cuál" y no "conservando el índice": después de reordenar, el
 * índice activo casi nunca es el mismo, y lo que la persona espera es seguir
 * viendo el archivo que estaba viendo.
 *
 * @param state Estado actual.
 * @param from Índice de origen.
 * @param to Índice de destino.
 * @returns El estado nuevo, o el mismo si algún índice no existe.
 * @example
 * moveTab({ tabs: [a, b, c], activeTabIndex: 0 }, 0, 2).activeTabIndex; // 2
 */
export function moveTab(state: TabsState, from: number, to: number): TabsState {
  const active = activeTab(state);
  const isValid = (index: number): boolean => index >= 0 && index < state.tabs.length;
  if (!isValid(from) || !isValid(to) || from === to) return state;

  const tabs = [...state.tabs];
  const [moved] = tabs.splice(from, 1);
  if (moved === undefined) return state;
  tabs.splice(to, 0, moved);

  return { tabs, activeTabIndex: tabs.findIndex((tab) => tab.path === active?.path) };
}

/**
 * Marca o desmarca una pestaña como sucia.
 *
 * @param state Estado actual.
 * @param path Ruta del archivo.
 * @param isDirty Si tiene cambios sin guardar.
 * @returns El estado nuevo.
 * @example
 * setTabDirty(state, 'C:\\p\\a.ts', true);
 */
export function setTabDirty(state: TabsState, path: string, isDirty: boolean): TabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, isDirty } : tab)),
  };
}

/**
 * La pestaña activa, o `undefined` si no hay ninguna.
 *
 * @param state Estado actual.
 * @returns La pestaña activa.
 * @example
 * activeTab(state)?.path;
 */
export function activeTab(state: TabsState): TabState | undefined {
  return state.activeTabIndex === -1 ? undefined : state.tabs[state.activeTabIndex];
}

/** Adónde va el foco tras cerrar la pestaña de `closed`. */
function nextActiveIndex(active: number, closed: number, remaining: number): number {
  // Se cerró una de la izquierda: la activa es la misma, corrida un lugar.
  if (closed < active) return active - 1;
  // Se cerró otra de la derecha: no la afecta.
  if (closed > active) return active;

  // Se cerró la activa: queda la de la derecha, que ahora ocupa este índice.
  // Si era la última, la de la izquierda.
  return Math.min(active, remaining - 1);
}
