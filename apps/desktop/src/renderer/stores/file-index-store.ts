import type { IndexedFile } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

interface FileIndexState {
  /** El índice del workspace. Vacío mientras no se haya pedido. */
  files: IndexedFile[];
  /** Si el índice se cortó por el tope del main. */
  isTruncated: boolean;
  /** Si el quick open está abierto. */
  isOpen: boolean;
  /** Si el índice se está construyendo. Feedback de progreso (RNF-24). */
  isLoading: boolean;
  error: SerializedError | null;

  /** Abre el quick open, construyendo el índice si es la primera vez. */
  open: () => Promise<void>;
  close: () => void;
  /** Tira el índice. Se llama al cambiar de workspace. */
  clear: () => void;
}

/**
 * Store del índice de archivos de quick open.
 *
 * El índice se pide **la primera vez que se abre el quick open**, no al abrir
 * el workspace: recorrer el árbol entero antes de pintar la primera pantalla
 * retrasaría el arranque, que es lo que mide
 * [RNF-01](../../../../../docs/04-requerimientos-no-funcionales.md#performance).
 * A cambio, la primera apertura de `Ctrl+P` en un repositorio grande tarda lo
 * que tarde el recorrido; las siguientes son instantáneas.
 *
 * @example
 * const files = useFileIndexStore((state) => state.files);
 */
export const useFileIndexStore = create<FileIndexState>((set, get) => ({
  files: [],
  isTruncated: false,
  isOpen: false,
  isLoading: false,
  error: null,

  open: async () => {
    set({ isOpen: true, error: null });

    // Ya está construido: abrir de nuevo no vuelve a recorrer el disco.
    if (get().files.length > 0) return;

    set({ isLoading: true });

    const result = await window.pastecode.invoke('files:index', {});

    if (!result.ok) {
      set({ isLoading: false, error: result.error });
      return;
    }

    set({
      isLoading: false,
      files: result.value.files,
      isTruncated: result.value.truncated,
    });
  },

  close: () => {
    set({ isOpen: false });
  },

  clear: () => {
    set({ files: [], isTruncated: false, isOpen: false, error: null });
  },
}));
