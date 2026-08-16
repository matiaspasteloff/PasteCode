import type { TabsState } from '@pastecode/core';
import {
  activateTab as activate,
  activeTab,
  closeTab as close,
  NO_TABS,
  openTab,
  setTabDirty,
} from '@pastecode/core';
import type { FileChangePayload, SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Contenido recién leído del disco, para que el editor arme el modelo. */
interface LoadedFile {
  path: string;
  content: string;
}

interface EditorState {
  tabs: TabsState;
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
  closeTab: (index: number) => void;
  activateTab: (index: number) => void;
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
 * const tabs = useEditorStore((state) => state.tabs);
 */
export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: NO_TABS,
  mtimes: {},
  pendingFile: null,
  isLoading: false,
  isSaving: false,
  error: null,
  conflict: null,
  readContent: null,

  open: async (path) => {
    // Ya abierto: se activa la pestaña y no se relee. El modelo tiene las
    // ediciones sin guardar y el historial de undo; releer los tiraría.
    if (get().tabs.tabs.some((tab) => tab.path === path)) {
      set({ tabs: openTab(get().tabs, path), error: null });
      return;
    }

    await loadFile(path, set, get);
  },

  closeTab: (index) => {
    const closed = get().tabs.tabs[index];
    if (closed === undefined) return;

    const { [closed.path]: _removed, ...mtimes } = get().mtimes;
    set({ tabs: close(get().tabs, index), mtimes });
  },

  activateTab: (index) => {
    set({ tabs: activate(get().tabs, index) });
  },

  consumePendingFile: () => {
    set({ pendingFile: null });
  },

  setContentReader: (read) => {
    set({ readContent: read });
  },

  markDirty: () => {
    const path = activeTab(get().tabs)?.path;
    if (path === undefined) return;

    set({ tabs: setTabDirty(get().tabs, path, true) });
  },

  save: (options) => saveActive(get(), set, options?.force === true),

  discardAndReload: async () => {
    const path = activeTab(get().tabs)?.path;
    if (path === undefined) return;

    set({ conflict: null });
    await loadFile(path, set, get);
  },

  applyExternalChanges: (changes) => applyExternalChanges(changes, set, get),

  closeAll: () => {
    set({ tabs: NO_TABS, mtimes: {}, pendingFile: null, error: null, conflict: null });
  },
}));

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
  const open = new Map(get().tabs.tabs.map((tab) => [tab.path, tab]));

  for (const change of changes) {
    const tab = open.get(change.path);

    if (tab === undefined) continue;

    if (change.kind === 'deleted') {
      // Sin diálogo: no hay ninguna decisión que tomar todavía. Marcarla sucia
      // es lo que hace que `Ctrl+S` la recree, y lo que impide que cerrarla se
      // sienta como una operación inocua.
      set({ tabs: setTabDirty(get().tabs, change.path, true) });
      continue;
    }

    if (tab.isDirty) {
      set({ conflict: externalChangeConflict(change.path) });
      continue;
    }

    await reloadFromDisk(change.path, set, get);
  }
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
    tabs: setTabDirty(get().tabs, path, false),
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

  const tabs = setTabDirty(openTab(get().tabs, path), path, false);
  set({
    isLoading: false,
    tabs,
    mtimes: { ...get().mtimes, [path]: result.value.mtimeMs },
    pendingFile: { path, content: result.value.content },
  });
}

/** Escribe la pestaña activa y actualiza el estado según cómo haya salido. */
async function saveActive(
  state: EditorState,
  set: SetEditorState,
  isForced: boolean
): Promise<void> {
  const path = activeTab(state.tabs)?.path;
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
    tabs: setTabDirty(state.tabs, path, false),
    mtimes: { ...mtimes, [path]: result.value.mtimeMs },
  });
}
