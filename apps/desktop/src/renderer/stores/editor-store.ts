import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** El archivo abierto en el editor, tal como se leyó del disco. */
export interface OpenFile {
  path: string;
  content: string;
  /** `mtimeMs` de la lectura. Vuelve como `expectedMtimeMs` al guardar. */
  mtimeMs: number;
}

interface EditorState {
  file: OpenFile | null;
  isLoading: boolean;
  /** Si hay un guardado en curso. Alimenta el feedback de RNF-24. */
  isSaving: boolean;
  /** Si el buffer tiene cambios sin guardar. */
  isDirty: boolean;
  error: SerializedError | null;
  /** Presente cuando el archivo cambió en disco y hay que decidir qué hacer. */
  conflict: SerializedError | null;
  /**
   * Devuelve el contenido actual del editor.
   *
   * Es una función y no una copia del texto porque el buffer lo tiene Monaco:
   * empujar el contenido al store en cada tecla sería copiar el archivo entero
   * por pulsación, y con 10MB abiertos eso se siente.
   */
  readContent: (() => string) | null;

  open: (path: string) => Promise<void>;
  close: () => void;
  setContentReader: (read: (() => string) | null) => void;
  markDirty: () => void;
  /** Guarda el buffer. `force` omite el chequeo de conflicto. */
  save: (options?: { force: boolean }) => Promise<void>;
  /** Descarta los cambios locales y vuelve a leer el archivo del disco. */
  discardAndReload: () => Promise<void>;
}

/** El `set` de Zustand, con lo justo que estas funciones necesitan. */
type SetEditorState = (partial: Partial<EditorState>) => void;

/**
 * Store del archivo abierto y su estado de guardado.
 *
 * Las dos operaciones largas viven fuera del creador del store. No es sólo por
 * el límite de 50 líneas por función: acá adentro quedan las transiciones de
 * estado, que se leen de un vistazo, y afuera el detalle de cada llamada.
 *
 * @example
 * const isDirty = useEditorStore((state) => state.isDirty);
 */
export const useEditorStore = create<EditorState>((set, get) => ({
  file: null,
  isLoading: false,
  isSaving: false,
  isDirty: false,
  error: null,
  conflict: null,
  readContent: null,

  open: (path) => openFile(path, set),

  close: () => {
    set({ file: null, error: null, conflict: null, isLoading: false, isDirty: false });
  },

  setContentReader: (read) => {
    set({ readContent: read });
  },

  markDirty: () => {
    if (!get().isDirty) set({ isDirty: true });
  },

  save: (options) => saveFile(get(), set, options?.force === true),

  discardAndReload: async () => {
    const { file } = get();
    if (file === null) return;

    set({ conflict: null });
    await openFile(file.path, set);
  },
}));

/** Lee un archivo y lo deja abierto, reemplazando al anterior. */
async function openFile(path: string, set: SetEditorState): Promise<void> {
  set({ isLoading: true, error: null, conflict: null });

  const result = await window.pastecode.invoke('fs:readFile', { path });

  if (!result.ok) {
    // El archivo abierto anterior se descarta igual: dejarlo en pantalla
    // mientras el mensaje habla de otro archivo confunde más que ayudar.
    set({ isLoading: false, error: result.error, file: null, isDirty: false });
    return;
  }

  set({
    isLoading: false,
    isDirty: false,
    file: { path, content: result.value.content, mtimeMs: result.value.mtimeMs },
  });
}

/** Escribe el buffer al disco y actualiza el estado según cómo haya salido. */
async function saveFile(
  state: EditorState,
  set: SetEditorState,
  isForced: boolean
): Promise<void> {
  const { file, readContent } = state;
  if (file === null || readContent === null) return;

  const content = readContent();
  set({ isSaving: true, conflict: null });

  const result = await window.pastecode.invoke('fs:writeFile', {
    path: file.path,
    content,
    // Se omite la propiedad en vez de mandarla en `undefined`: con
    // `exactOptionalPropertyTypes` no son lo mismo, y el schema es estricto.
    ...(isForced ? {} : { expectedMtimeMs: file.mtimeMs }),
  });

  if (!result.ok) {
    // Un conflicto no es un error cualquiera: no se resuelve solo y la
    // decisión es de la persona, así que va a su propio campo del estado.
    // El estado sucio se conserva; perderlo haría creer que se guardó.
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
    isDirty: false,
    file: { ...file, content, mtimeMs: result.value.mtimeMs },
  });
}
