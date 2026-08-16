import { useEffect } from 'react';

import { useSettingsStore } from '../../stores/settings-store.js';
import { useThemeStore } from '../../stores/theme-store.js';

/**
 * Carga las settings y las mantiene sincronizadas con el disco.
 *
 * Es el otro extremo de la recarga en caliente de
 * [RF-704](../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración):
 * el main observa los archivos y emite, y esto escucha. Editar
 * `~/.pastecode/settings.json` con la app abierta cambia lo que se ve sin
 * reiniciar nada.
 *
 * `window.theme` pasa a ser la fuente del tema. El `theme-store` sigue
 * existiendo porque el comando de la paleta cambia el tema **sin escribir el
 * archivo** —es una prueba rápida, no una preferencia— y porque es quien
 * resuelve `system` contra `prefers-color-scheme`. Lo que cambia es de dónde
 * sale el valor inicial.
 *
 * @example
 * useSettings(); // una vez, en el cascarón de la app
 */
export function useSettings(): void {
  const load = useSettingsStore((state) => state.load);
  const apply = useSettingsStore((state) => state.apply);
  const theme = useSettingsStore((state) => state.settings.window.theme);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      window.pastecode.subscribe('settings:changed', (event) => {
        apply(event.settings, event.error);
      }),
    [apply]
  );

  useEffect(() => {
    useThemeStore.getState().setTheme(theme);
  }, [theme]);
}
