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
  error: SerializedError | null;
  /** Lee un archivo y lo deja abierto. Reemplaza al anterior. */
  open: (path: string) => Promise<void>;
  /** Cierra lo que haya abierto. Se usa al cambiar de workspace. */
  close: () => void;
}

/**
 * Store del archivo abierto.
 *
 * Todavía es un solo archivo: las pestañas y el registro de modelos son el
 * paso 16. Lo que queda fijo desde acá es que el `mtimeMs` de la lectura se
 * guarda junto al contenido, porque es lo que hace posible detectar que el
 * archivo cambió en disco a la hora de guardar.
 *
 * @example
 * const file = useEditorStore((state) => state.file);
 */
export const useEditorStore = create<EditorState>((set) => ({
  file: null,
  isLoading: false,
  error: null,

  open: async (path) => {
    set({ isLoading: true, error: null });

    const result = await window.pastecode.invoke('fs:readFile', { path });

    if (!result.ok) {
      // El archivo abierto anterior se descarta igual: dejarlo en pantalla
      // mientras el mensaje habla de otro archivo confunde más que ayudar.
      set({ isLoading: false, error: result.error, file: null });
      return;
    }

    set({
      isLoading: false,
      file: { path, content: result.value.content, mtimeMs: result.value.mtimeMs },
    });
  },

  close: () => {
    set({ file: null, error: null, isLoading: false });
  },
}));
