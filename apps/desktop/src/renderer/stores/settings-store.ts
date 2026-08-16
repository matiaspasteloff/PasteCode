import type { Settings, SettingsFile } from '@pastecode/core';
import { DEFAULT_SETTINGS } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Las settings tal como las ve la UI. */
interface SettingsState {
  /** Las settings resueltas. Nunca `null`: arranca en los defaults. */
  settings: Settings;
  /** El error del último archivo que no parseó, o `null` (RNF-25). */
  error: SerializedError | null;
  /** Pide las settings al main. Se llama una vez, al montar. */
  load: () => Promise<void>;
  /** Escribe un parche en una de las dos capas. */
  update: (scope: 'user' | 'workspace', patch: SettingsFile) => Promise<void>;
  /** Aplica lo que llegó por `settings:changed`. */
  apply: (settings: Settings, error: SerializedError | null) => void;
}

/**
 * Store de las settings resueltas.
 *
 * Arranca en `DEFAULT_SETTINGS` y no en `null` a propósito: si arrancara vacío,
 * cada componente que lee una setting tendría que manejar el caso "todavía no
 * cargó", y el editor se montaría con un tamaño de fuente indefinido. Los
 * defaults son un estado inicial perfectamente válido, y el `settings:get`
 * del arranque sólo los corrige.
 *
 * La fuente de verdad es el main, que es el único que ve los archivos. Este
 * store es una réplica que se refresca con `settings:changed`.
 *
 * @example
 * const fontSize = useSettingsStore((state) => state.settings.editor.fontSize);
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  error: null,

  load: async () => {
    const result = await window.pastecode.invoke('settings:get', {});

    if (!result.ok) {
      set({ error: result.error });
      return;
    }

    set({ settings: result.value.settings, error: result.value.error });
  },

  update: async (scope, patch) => {
    const result = await window.pastecode.invoke('settings:update', { scope, settings: patch });

    if (!result.ok) {
      set({ error: result.error });
      return;
    }

    set({ settings: result.value.settings, error: result.value.error });
  },

  apply: (settings, error) => {
    set({ settings, error });
  },
}));
