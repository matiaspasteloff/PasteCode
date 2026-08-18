import type { Keybinding, KeybindingConflict } from '@pastecode/core';
import { userKeybindings } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Los atajos del usuario tal como los ve la UI. */
interface KeybindingsState {
  /** Sólo los del usuario. Los de fábrica son una constante de `core`. */
  bindings: readonly Keybinding[];
  /** Los que se pisan, sobre la lista completa (RF-702). */
  conflicts: readonly KeybindingConflict[];
  /** El error del archivo, o `null`. La app sigue con los de fábrica. */
  error: SerializedError | null;
  /** Pide los atajos al main. Se llama una vez, al montar. */
  load: () => Promise<void>;
  /** Aplica lo que llegó por `keybindings:changed`. */
  apply: (
    bindings: readonly Keybinding[],
    conflicts: readonly KeybindingConflict[],
    error: SerializedError | null
  ) => void;
}

/**
 * Store de los atajos del usuario.
 *
 * Arranca vacío y no en `null`: ningún atajo propio es un estado perfectamente
 * válido —es el de una instalación nueva— y evita que quien resuelve una tecla
 * tenga que distinguir "todavía no cargó" de "no hay ninguno".
 *
 * La fuente de verdad es el main, que es el único que ve el archivo. Esto es
 * una réplica que se refresca con `keybindings:changed`.
 *
 * @example
 * const conflicts = useKeybindingsStore((state) => state.conflicts);
 */
export const useKeybindingsStore = create<KeybindingsState>((set) => ({
  bindings: [],
  conflicts: [],
  error: null,

  load: async () => {
    const result = await window.pastecode.invoke('keybindings:get', {});

    if (!result.ok) {
      set({ error: result.error });
      return;
    }

    set({
      // Pasa por `userKeybindings` y no se asigna directo: lo que sale del
      // schema Zod trae `when?: string | undefined`, y con
      // `exactOptionalPropertyTypes` eso no es un `Keybinding`. La misma
      // función que normaliza el archivo en el main deja la forma exacta, y
      // normalizar una tecla ya normalizada no cambia nada.
      bindings: userKeybindings(result.value.bindings),
      conflicts: result.value.conflicts,
      error: result.value.error,
    });
  },

  apply: (bindings, conflicts, error) => {
    set({ bindings, conflicts, error });
  },
}));
