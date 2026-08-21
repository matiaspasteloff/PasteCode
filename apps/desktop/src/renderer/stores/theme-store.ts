import { create } from 'zustand';

/** Las tres opciones de `window.theme` del schema de settings. */
const THEMES = ['light', 'dark', 'system'] as const;

/** La preferencia elegida. `system` sigue al sistema operativo. */
type Theme = (typeof THEMES)[number];

/** El tema que termina aplicándose. `system` ya está resuelto acá. */
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  /**
   * El tema que se está previsualizando, o `null`.
   *
   * Existe para el selector de `Ctrl+K Ctrl+T`: mover la selección lo aplica y
   * cancelar lo restaura. Va **aparte** de `window.colorTheme` a propósito —si
   * el preview escribiera las settings, cada tecla de flecha escribiría el
   * `settings.json` del usuario, y cancelar tendría que deshacerlo—.
   */
  preview: string | null;
  /** Si el selector de `Ctrl+K Ctrl+T` está a la vista. */
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  setTheme: (theme: Theme) => void;
  /** Rota entre claro, oscuro y sistema. Es lo que usa el comando. */
  cycleTheme: () => void;
  /** Pinta un tema sin guardarlo. `null` vuelve a lo elegido de verdad. */
  setPreview: (colorTheme: string | null) => void;
}

/**
 * Store del tema.
 *
 * Vive en memoria: persistirlo es la Etapa 3, paso 21. Lo que sí queda fijo
 * desde acá es que `system` es un valor posible y no la ausencia de valor —si
 * fuera `null`, no habría forma de distinguir "seguí al sistema" de "todavía
 * no eligió", y son cosas distintas cuando entren las settings.
 *
 * @example
 * const theme = useThemeStore((state) => state.theme);
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  preview: null,
  isPickerOpen: false,

  setTheme: (theme) => {
    set({ theme });
  },

  cycleTheme: () => {
    const next = THEMES[(THEMES.indexOf(get().theme) + 1) % THEMES.length] ?? 'system';
    set({ theme: next });
  },

  setPreview: (preview) => {
    set({ preview });
  },

  openPicker: () => {
    set({ isPickerOpen: true });
  },

  closePicker: () => {
    set({ isPickerOpen: false });
  },
}));
