import type { TabsState } from '@pastecode/core';
import {
  activateTab as activate,
  activeTab,
  closeTab as close,
  NO_TABS,
  openTab,
  setTabDirty,
} from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
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

  closeAll: () => {
    set({ tabs: NO_TABS, mtimes: {}, pendingFile: null, error: null, conflict: null });
  },
}));

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
