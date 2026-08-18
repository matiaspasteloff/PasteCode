import type { EditorLayout, GroupsState, TabsState } from '@pastecode/core';
import {
  activateTab as activate,
  activeGroup,
  activeTab,
  activeTabs,
  closeGroup as removeGroup,
  closeTab as close,
  focusGroup as focus,
  openTab,
  setTabDirty,
  SINGLE_EMPTY_GROUPS,
  splitGroups,
  updateActiveGroup,
  updateGroup,
} from '@pastecode/core';
import type { FileChangePayload, SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Contenido recién leído del disco, para que el editor arme el modelo. */
interface LoadedFile {
  path: string;
  content: string;
}

interface EditorState {
  /**
   * Los grupos de edición, cuál tiene el foco y cómo se reparten la pantalla.
   *
   * Reemplaza al `TabsState` plano de antes. `mtimes`, `pendingFile` e
   * `isLoading` siguen siendo globales **a propósito**: son del archivo, no del
   * grupo. Un archivo abierto en los dos paneles tiene un solo `mtime`.
   * Ver [ADR-0023](../../../../../docs/adr/0023-dos-grupos-sobre-modelos-compartidos.md).
   */
  groups: GroupsState;
  /**
   * `mtimeMs` de la última lectura de cada archivo abierto, por ruta. Es lo
   * que vuelve como `expectedMtimeMs` al guardar.
   */
  mtimes: Readonly<Record<string, number>>;
  /**
   * El archivo que acaba de leerse y todavía no tiene modelo.
   *
   * Existe porque el contenido lo consume una sola vez el registro de
   * modelos: después de eso la fuente de verdad es el modelo de Monaco, no el
   * store. Guardar el texto acá además del modelo sería tener dos copias del
   * archivo y una forma de que se desincronicen.
   */
  pendingFile: LoadedFile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: SerializedError | null;
  conflict: SerializedError | null;
  readContent: (() => string) | null;

  open: (path: string) => Promise<void>;
  /**
   * Abre un archivo con el contenido de un respaldo, no con el del disco.
   *
   * Es la mitad del renderer de [RNF-08](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
   * La pestaña queda **sucia**, y tiene que quedar así: lo que se muestra no es
   * lo que hay en el disco, y una pestaña limpia diría que ya está guardado.
   * El `mtimeMs` sigue siendo el del disco, así que `Ctrl+S` detecta el
   * conflicto si el archivo cambió mientras la app estuvo cerrada.
   */
  restoreFromBackup: (path: string, content: string) => Promise<void>;
  closeTab: (groupId: string, index: number) => void;
  activateTab: (groupId: string, index: number) => void;
  /** Parte la pantalla y lleva la pestaña activa al grupo nuevo (RF-107). */
  splitEditor: (layout: Exclude<EditorLayout, 'single'>) => void;
  focusGroup: (groupId: string) => void;
  consumePendingFile: () => void;
  setContentReader: (read: (() => string) | null) => void;
  markDirty: () => void;
  save: (options?: { force: boolean }) => Promise<void>;
  discardAndReload: () => Promise<void>;
  /**
   * Aplica lo que el watcher informó que cambió en el disco (RF-004).
   *
   * Tres caminos, y la diferencia entre ellos es todo lo que importa:
   *
   * - **Pestaña limpia:** se relee en silencio. No hay nada que perder.
   * - **Pestaña sucia:** el `ConflictDialog` que ya existe, con una variante
   *   nueva. Recargar encima de lo que alguien escribió es destruir trabajo.
   * - **Archivo borrado:** se conserva la pestaña, marcada como sucia y sin
   *   diálogo. Lo que hay en el editor es ahora la única copia que queda, y
   *   `Ctrl+S` lo recrea.
   */
  applyExternalChanges: (changes: readonly FileChangePayload[]) => Promise<void>;
  closeAll: () => void;
}

/** El `set` de Zustand, con lo justo que estas funciones necesitan. */
type SetEditorState = (partial: Partial<EditorState>) => void;

/**
 * Store de las pestañas abiertas y del guardado.
 *
 * La lógica de pestañas —qué queda activa al cerrar, qué pasa al reordenar—
 * no está acá sino en `packages/core`, donde es pura y está testeada sin
 * montar nada. Acá queda lo que necesita el navegador: el IPC y el estado de
 * carga.
 *
 * @example
 * const groups = useEditorStore((state) => state.groups);
 */
export const useEditorStore = create<EditorState>((set, get) => ({
  groups: SINGLE_EMPTY_GROUPS,
  mtimes: {},
  pendingFile: null,
  isLoading: false,
  isSaving: false,
  error: null,
  conflict: null,
  readContent: null,

  open: async (path) => {
    await openPath(path, set, get);
  },

  restoreFromBackup: async (path, content) => {
    await restoreBackup(path, content, set, get);
  },

  ...groupActions(set, get),

  consumePendingFile: () => {
    set({ pendingFile: null });
  },

  setContentReader: (read) => {
    set({ readContent: read });
  },

  markDirty: () => {
    const path = activeTab(activeTabs(get().groups))?.path;

    if (path === undefined) return;

    set({ groups: setDirtyEverywhere(get().groups, path, true) });
  },

  save: (options) => saveActive(get(), set, options?.force === true),

  discardAndReload: async () => {
    const path = activeTab(activeTabs(get().groups))?.path;

    if (path === undefined) return;

    set({ conflict: null });
    await loadFile(path, set, get);
  },

  applyExternalChanges: (changes) => applyExternalChanges(changes, set, get),

  closeAll: () => {
    set({
      groups: SINGLE_EMPTY_GROUPS,
      mtimes: {},
      pendingFile: null,
      error: null,
      conflict: null,
    });
  },
}));

/**
 * Las acciones que sólo tocan los grupos.
 *
 * Salen de la fábrica del store para que quepa de un vistazo, que es lo que
 * RNF-20 pide; no tienen otra vida propia.
 */
function groupActions(
  set: SetEditorState,
  get: () => EditorState
): Pick<EditorState, 'closeTab' | 'activateTab' | 'splitEditor' | 'focusGroup'> {
  return {
    closeTab: (groupId, index) => {
      const { groups, mtimes } = get();
      const group = groups.groups.find((candidate) => candidate.id === groupId);
      const closed = group?.tabs.tabs[index];

      if (group === undefined || closed === undefined) return;

      const next = updateGroup(groups, groupId, (tabs) => close(tabs, index));

      set({
        groups: dropEmptyGroup(next, groupId),
        // El `mtime` se olvida sólo si el archivo no quedó abierto en el otro
        // grupo: perderlo con una pestaña viva convertiría el próximo guardado
        // en un `STALE_FILE` falso.
        mtimes: forgetIfUnused(mtimes, closed.path, next),
      });
    },

    activateTab: (groupId, index) => {
      set({
        groups: focus(
          updateGroup(get().groups, groupId, (tabs) => activate(tabs, index)),
          groupId
        ),
      });
    },

    splitEditor: (layout) => {
      set({ groups: splitGroups(get().groups, layout) });
    },

    focusGroup: (groupId) => {
      set({ groups: focus(get().groups, groupId) });
    },
  };
}

/**
 * Las pestañas del grupo enfocado.
 *
 * Es el selector que reemplaza al viejo `state.tabs`. Se exporta acá y no se
 * repite el `activeTabs(state.groups)` en cada componente para que el día que
 * haya un tercer grupo, lo que cambie sea una función.
 *
 * @param state El estado del store.
 * @returns Las pestañas del grupo con el foco.
 * @example
 * const tabs = useEditorStore(selectActiveTabs);
 */
export function selectActiveTabs(state: { groups: GroupsState }): TabsState {
  return activeTabs(state.groups);
}

/**
 * Marca un archivo en **todos** los grupos.
 *
 * Un archivo abierto en dos paneles comparte el modelo de Monaco, así que
 * ensuciarlo en uno lo ensucia en el otro: marcarlo en un solo lugar dejaría
 * una pestaña diciendo que está limpia sobre un buffer que no lo está.
 */
function setDirtyEverywhere(groups: GroupsState, path: string, isDirty: boolean): GroupsState {
  return groups.groups.reduce(
    (state, group) => updateGroup(state, group.id, (tabs) => setTabDirty(tabs, path, isDirty)),
    groups
  );
}

/** Cierra el grupo si se quedó sin pestañas y no es el único. */
function dropEmptyGroup(groups: GroupsState, groupId: string): GroupsState {
  const group = groups.groups.find((candidate) => candidate.id === groupId);

  if (group === undefined || group.tabs.tabs.length > 0) return groups;

  return removeGroup(groups, groupId);
}

/** Olvida el `mtime` sólo si el archivo ya no está abierto en ningún grupo. */
function forgetIfUnused(
  mtimes: Readonly<Record<string, number>>,
  path: string,
  groups: GroupsState
): Readonly<Record<string, number>> {
  const isOpen = groups.groups.some((group) =>
    group.tabs.tabs.some((tab) => tab.path === path)
  );

  if (isOpen) return mtimes;

  const { [path]: _removed, ...rest } = mtimes;

  return rest;
}

/**
 * Reacciona a los cambios que vio el watcher.
 *
 * Sólo se miran los archivos **abiertos**: que un archivo del disco cambie no
 * es asunto del editor si nadie lo está mirando, y recorrer miles de rutas por
 * cada `git checkout` para descartarlas todas es trabajo puro.
 */
async function applyExternalChanges(
  changes: readonly FileChangePayload[],
  set: SetEditorState,
  get: () => EditorState
): Promise<void> {
  for (const change of changes) {
    const tab = openTabFor(get().groups, change.path);

    if (tab === undefined) continue;

    if (change.kind === 'deleted') {
      // Sin diálogo: no hay ninguna decisión que tomar todavía. Marcarla sucia
      // es lo que hace que `Ctrl+S` la recree, y lo que impide que cerrarla se
      // sienta como una operación inocua.
      set({ groups: setDirtyEverywhere(get().groups, change.path, true) });
      continue;
    }

    if (tab.isDirty) {
      set({ conflict: externalChangeConflict(change.path) });
      continue;
    }

    await reloadFromDisk(change.path, set, get);
  }
}

/** La pestaña de un archivo en cualquier grupo, si está abierta en alguno. */
function openTabFor(
  groups: GroupsState,
  path: string
): { path: string; isDirty: boolean } | undefined {
  for (const group of groups.groups) {
    const found = group.tabs.tabs.find((tab) => tab.path === path);

    if (found !== undefined) return found;
  }

  return undefined;
}

/**
 * Relee un archivo limpio, sin tocar qué pestaña está activa.
 *
 * Es casi `loadFile`, pero **no activa la pestaña**: el archivo que cambió en
 * el disco puede ser uno que no se está mirando, y saltar a él porque una
 * herramienta externa lo tocó sería robarle el foco a alguien que está
 * escribiendo en otro lado.
 *
 * **Siempre se actualiza `mtimes`**, incluso en esta recarga silenciosa.
 * Olvidarlo convierte cada cambio externo en un `STALE_FILE` falso la próxima
 * vez que se guarde ese archivo.
 */
async function reloadFromDisk(
  path: string,
  set: SetEditorState,
  get: () => EditorState
): Promise<void> {
  const result = await window.pastecode.invoke('fs:readFile', { path });

  if (!result.ok) return;

  set({
    mtimes: { ...get().mtimes, [path]: result.value.mtimeMs },
    groups: setDirtyEverywhere(get().groups, path, false),
    pendingFile: { path, content: result.value.content },
  });
}

/** El conflicto de un cambio externo sobre una pestaña con ediciones sin guardar. */
function externalChangeConflict(path: string): SerializedError {
  return {
    code: 'EXTERNAL_CHANGE',
    userMessage: `"${path}" cambió en el disco y tenés cambios sin guardar. Guardá para sobrescribirlo, o descartá para quedarte con lo del disco.`,
  };
}

/** Lee un archivo del disco y lo deja listo para que el editor lo monte. */
async function loadFile(
  path: string,
  set: SetEditorState,
  get: () => EditorState
): Promise<void> {
  set({ isLoading: true, error: null, conflict: null });

  const result = await window.pastecode.invoke('fs:readFile', { path });

  if (!result.ok) {
    set({ isLoading: false, error: result.error });
    return;
  }

  const opened = updateActiveGroup(get().groups, (tabs) => openTab(tabs, path));

  set({
    isLoading: false,
    groups: setDirtyEverywhere(opened, path, false),
    mtimes: { ...get().mtimes, [path]: result.value.mtimeMs },
    pendingFile: { path, content: result.value.content },
  });
}

/**
 * Abre un archivo, releyéndolo del disco sólo si hace falta.
 *
 * Si ya está abierto en el grupo enfocado se activa la pestaña y **no** se
 * relee: el modelo de Monaco tiene las ediciones sin guardar y el historial de
 * deshacer, y releer los tiraría.
 */
async function openPath(
  path: string,
  set: SetEditorState,
  get: () => EditorState
): Promise<void> {
  if (activeTabs(get().groups).tabs.some((tab) => tab.path === path)) {
    set({
      groups: updateActiveGroup(get().groups, (tabs) => openTab(tabs, path)),
      error: null,
    });
    return;
  }

  await loadFile(path, set, get);
}

/**
 * Abre un archivo con el contenido de un respaldo (RNF-08).
 *
 * El `mtime` del disco se lee igual, aunque su contenido se descarte: es lo que
 * `Ctrl+S` manda después como `expectedMtimeMs`, y sin él guardar lo recuperado
 * pisaría en silencio un archivo que cambió mientras la app no estaba.
 */
async function restoreBackup(
  path: string,
  content: string,
  set: SetEditorState,
  get: () => EditorState
): Promise<void> {
  const result = await window.pastecode.invoke('fs:readFile', { path });
  const opened = updateActiveGroup(get().groups, (tabs) => openTab(tabs, path));

  set({
    isLoading: false,
    groups: setDirtyEverywhere(opened, path, true),
    mtimes: result.ok ? { ...get().mtimes, [path]: result.value.mtimeMs } : get().mtimes,
    pendingFile: { path, content },
  });
}

/** Escribe la pestaña activa y actualiza el estado según cómo haya salido. */
async function saveActive(
  state: EditorState,
  set: SetEditorState,
  isForced: boolean
): Promise<void> {
  const path = activeTab(activeTabs(state.groups))?.path;
  const { readContent, mtimes } = state;

  if (path === undefined || readContent === null) return;

  const content = readContent();

  set({ isSaving: true, conflict: null });

  const expectedMtimeMs = mtimes[path];
  const result = await window.pastecode.invoke('fs:writeFile', {
    path,
    content,
    // Se omite la propiedad en vez de mandarla en `undefined`: con
    // `exactOptionalPropertyTypes` no son lo mismo, y el schema es estricto.
    ...(isForced || expectedMtimeMs === undefined ? {} : { expectedMtimeMs }),
  });

  if (!result.ok) {
    // Un conflicto no es un error cualquiera: no se resuelve solo y la
    // decisión es de la persona. El estado sucio se conserva; perderlo haría
    // creer que se guardó.
    const isConflict = result.error.code === 'STALE_FILE';

    set({
      isSaving: false,
      conflict: isConflict ? result.error : null,
      error: isConflict ? null : result.error,
    });
    return;
  }

  set({
    isSaving: false,
    groups: setDirtyEverywhere(state.groups, path, false),
    mtimes: { ...mtimes, [path]: result.value.mtimeMs },
  });
}

/** El id del grupo enfocado. Lo usan los comandos, que no tienen un grupo a mano. */
export function activeGroupId(state: { groups: GroupsState }): string {
  return activeGroup(state.groups).id;
}
