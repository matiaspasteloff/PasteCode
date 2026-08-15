import { create } from 'zustand';

/** Las tres opciones de `window.theme` del schema de settings. */
const THEMES = ['light', 'dark', 'system'] as const;

/** La preferencia elegida. `system` sigue al sistema operativo. */
type Theme = (typeof THEMES)[number];

/** El tema que termina aplicándose. `system` ya está resuelto acá. */
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Rota entre claro, oscuro y sistema. Es lo que usa el comando. */
  cycleTheme: () => void;
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

  setTheme: (theme) => {
    set({ theme });
  },

  cycleTheme: () => {
    const next = THEMES[(THEMES.indexOf(get().theme) + 1) % THEMES.length] ?? 'system';
    set({ theme: next });
  },
}));
