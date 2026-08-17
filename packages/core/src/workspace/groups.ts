import type { TabsState } from './tabs.js';
import { activeTab, NO_TABS, openTab } from './tabs.js';

/**
 * Cómo se reparten los grupos la pantalla.
 *
 * Es un array `as const` y no un enum, como el resto del proyecto: la unión
 * sale del array, así que la lista se puede recorrer.
 */
export const EDITOR_LAYOUTS = ['single', 'horizontal', 'vertical'] as const;

export type EditorLayout = (typeof EDITOR_LAYOUTS)[number];

/** Un grupo de edición: una tira de pestañas con su propia activa. */
export interface EditorGroup {
  readonly id: string;
  readonly tabs: TabsState;
}

/** Los grupos abiertos, cuál tiene el foco y cómo se reparten la pantalla. */
export interface GroupsState {
  readonly groups: readonly EditorGroup[];
  readonly activeGroupId: string;
  readonly layout: EditorLayout;
}

export const PRIMARY_GROUP_ID = 'primary';
export const SECONDARY_GROUP_ID = 'secondary';

/**
 * Cuántos grupos se permiten.
 *
 * [RF-107](../../../../docs/03-requerimientos-funcionales.md) pide hasta tres y
 * se entrega con dos, con una nota de alcance. Estas funciones **están escritas
 * para N**: el diferimiento es sólo de UI —el layout de tres paneles y los
 * atajos— y subir la constante no toca ninguna de ellas.
 */
export const MAX_GROUPS = 2;

/** Un solo grupo, sin pestañas. Es el estado de arranque. */
export const SINGLE_EMPTY_GROUPS: GroupsState = {
  groups: [{ id: PRIMARY_GROUP_ID, tabs: NO_TABS }],
  activeGroupId: PRIMARY_GROUP_ID,
  layout: 'single',
};

/**
 * El grupo enfocado.
 *
 * Nunca es `undefined`: siempre hay al menos un grupo, y si el id activo
 * apuntara a uno que ya no está —lo que sólo pasaría por un bug— se devuelve el
 * primero en vez de dejar a la UI sin nada que dibujar.
 *
 * @param state Estado actual.
 * @returns El grupo enfocado.
 * @example
 * activeGroup(state).tabs;
 */
export function activeGroup(state: GroupsState): EditorGroup {
  const found = state.groups.find((group) => group.id === state.activeGroupId);

  return found ?? state.groups[0] ?? { id: PRIMARY_GROUP_ID, tabs: NO_TABS };
}

/**
 * Las pestañas del grupo enfocado.
 *
 * Es el reemplazo directo del viejo `state.tabs` del store: todo lo que antes
 * operaba sobre "las pestañas" ahora opera sobre las del grupo con el foco, que
 * es lo que la persona está mirando.
 *
 * @param state Estado actual.
 * @returns Las pestañas del grupo activo.
 * @example
 * activeTabs(state).activeTabIndex;
 */
export function activeTabs(state: GroupsState): TabsState {
  return activeGroup(state).tabs;
}

/**
 * Aplica un cambio a las pestañas de un grupo.
 *
 * Toda la lógica de pestañas sigue siendo la de `tabs.ts`, sin tocar: **eso es
 * el punto**. `TabsState` siempre tuvo forma de "por grupo", así que partir la
 * pantalla no cambió una sola línea de cómo se abre, se cierra o se reordena
 * una pestaña.
 *
 * @param state Estado actual.
 * @param groupId Qué grupo.
 * @param update Qué hacerle a sus pestañas.
 * @returns El estado nuevo, o el mismo si el grupo no existe.
 * @example
 * updateGroup(state, 'primary', (tabs) => openTab(tabs, path));
 */
export function updateGroup(
  state: GroupsState,
  groupId: string,
  update: (tabs: TabsState) => TabsState
): GroupsState {
  if (!state.groups.some((group) => group.id === groupId)) return state;

  return {
    ...state,
    groups: state.groups.map((group) =>
      group.id === groupId ? { ...group, tabs: update(group.tabs) } : group
    ),
  };
}

/**
 * Ídem, sobre el grupo enfocado.
 *
 * @param state Estado actual.
 * @param update Qué hacerle a sus pestañas.
 * @returns El estado nuevo.
 * @example
 * updateActiveGroup(state, (tabs) => closeTab(tabs, index));
 */
export function updateActiveGroup(
  state: GroupsState,
  update: (tabs: TabsState) => TabsState
): GroupsState {
  return updateGroup(state, activeGroup(state).id, update);
}

/**
 * Parte la pantalla, llevando la pestaña activa al grupo nuevo.
 *
 * Si ya hay dos grupos no crea un tercero: cambia la orientación y manda la
 * pestaña activa al otro, que es lo que la persona quiso decir al pedir un
 * split que ya existe.
 *
 * @param state Estado actual.
 * @param layout Orientación pedida.
 * @returns El estado nuevo, con el foco en el grupo destino.
 * @example
 * splitGroups(state, 'horizontal');
 */
export function splitGroups(
  state: GroupsState,
  layout: Exclude<EditorLayout, 'single'>
): GroupsState {
  const source = activeGroup(state);
  const path = activeTab(source.tabs)?.path;
  const targetId = source.id === PRIMARY_GROUP_ID ? SECONDARY_GROUP_ID : PRIMARY_GROUP_ID;

  const withTarget: GroupsState =
    state.groups.length >= MAX_GROUPS
      ? { ...state, layout }
      : {
          ...state,
          layout,
          groups: [...state.groups, { id: targetId, tabs: NO_TABS }],
        };

  const withTab =
    path === undefined
      ? withTarget
      : updateGroup(withTarget, targetId, (tabs) => openTab(tabs, path));

  return { ...withTab, activeGroupId: targetId };
}

/**
 * Cierra un grupo y vuelve a un solo panel si era el último que sobraba.
 *
 * **Nunca cierra el último grupo**: quedarse sin ninguno dejaría a la UI sin
 * dónde abrir el archivo siguiente.
 *
 * @param state Estado actual.
 * @param groupId Qué grupo cerrar.
 * @returns El estado nuevo.
 * @example
 * closeGroup(state, 'secondary');
 */
export function closeGroup(state: GroupsState, groupId: string): GroupsState {
  if (state.groups.length <= 1) return state;

  const groups = state.groups.filter((group) => group.id !== groupId);
  const survivor = groups[0];

  if (survivor === undefined) return state;

  return {
    groups,
    activeGroupId: groups.length === 1 ? survivor.id : state.activeGroupId,
    layout: groups.length === 1 ? 'single' : state.layout,
  };
}

/**
 * Le da el foco a un grupo.
 *
 * @param state Estado actual.
 * @param groupId Qué grupo.
 * @returns El estado nuevo, o el mismo si ese grupo no existe.
 * @example
 * focusGroup(state, 'secondary');
 */
export function focusGroup(state: GroupsState, groupId: string): GroupsState {
  if (!state.groups.some((group) => group.id === groupId)) return state;

  return { ...state, activeGroupId: groupId };
}

/**
 * Todas las rutas abiertas en cualquier grupo, sin repetir.
 *
 * **Es la función que evita el bug número uno de esta feature.** `App` llamaba
 * a `releaseModelsExcept` con las pestañas de un solo lugar; con dos grupos,
 * cerrar una pestaña en uno desecharía el modelo que el otro está mostrando, y
 * Monaco tira al siguiente render.
 *
 * @param state Estado actual.
 * @returns Las rutas, sin duplicados.
 * @example
 * releaseModelsExcept(allOpenPaths(groups));
 */
export function allOpenPaths(state: GroupsState): string[] {
  return [...new Set(state.groups.flatMap((group) => group.tabs.tabs.map((tab) => tab.path)))];
}

/**
 * Un solo grupo con estas pestañas.
 *
 * Es lo que se usa al restaurar una sesión escrita por una versión anterior,
 * que sólo guardaba `openTabs`. Ver
 * [ADR-0023](../../../../docs/adr/0023-dos-grupos-sobre-modelos-compartidos.md).
 *
 * @param tabs Las pestañas restauradas.
 * @returns El estado con un solo grupo.
 * @example
 * groupsFromTabs(restoredTabs);
 */
export function groupsFromTabs(tabs: TabsState): GroupsState {
  return {
    groups: [{ id: PRIMARY_GROUP_ID, tabs }],
    activeGroupId: PRIMARY_GROUP_ID,
    layout: 'single',
  };
}
