import { BUILT_IN_THEMES } from '@pastecode/core';
import { useMemo, useState } from 'react';

import { QuickPick } from '../../components/QuickPick.js';
import { t } from '../../i18n/index.js';
import { useExtensionsStore } from '../../stores/extensions-store.js';
import { useSettingsStore } from '../../stores/settings-store.js';
import { useThemeStore } from '../../stores/theme-store.js';

/** Una entrada del selector: un tema incorporado o uno de extensión. */
interface ThemeChoice {
  id: string;
  label: string;
  /** De dónde salió. Es el texto en gris de la fila. */
  origin: string;
}

/**
 * El selector de temas, con preview en vivo (`Ctrl+K Ctrl+T`).
 *
 * **Mover la selección aplica el tema; cancelar restaura el anterior.** Es la
 * única forma honesta de elegir un tema: la miniatura de una paleta no dice
 * nada sobre cómo se ve el código propio, y probar-guardar-arrepentirse
 * significa escribir el `settings.json` del usuario tres veces.
 *
 * El preview vive en `theme-store` y no en las settings justamente por eso: si
 * escribiera `window.colorTheme`, cada tecla de flecha guardaría un archivo.
 *
 * Reusa el `QuickPick` de la paleta de comandos y de quick open. Es la tercera
 * feature que lo usa sin tocarlo, que era el punto de haberlo generalizado.
 */
export function ThemePicker(): React.JSX.Element | null {
  const isOpen = useThemeStore((state) => state.isPickerOpen);
  const setPreview = useThemeStore((state) => state.setPreview);
  const close = useThemeStore((state) => state.closePicker);
  const contributed = useExtensionsStore((state) => state.themes);
  const update = useSettingsStore((state) => state.update);
  const [query, setQuery] = useState('');

  const choices = useMemo(() => allChoices(contributed), [contributed]);
  const matches = useMemo(
    () => choices.filter((choice) => matchesQuery(choice, query)),
    [choices, query]
  );

  return (
    <QuickPick
      isOpen={isOpen}
      items={matches}
      getKey={(choice) => choice.id}
      getLabel={(choice) => choice.label}
      getDetail={(choice) => choice.origin}
      query={query}
      onQueryChange={setQuery}
      onHighlight={(choice) => {
        // El preview sigue al resaltado, no a la elección: es lo que hace que
        // mover la flecha pinte el IDE entero.
        setPreview(choice?.id ?? null);
      }}
      onPick={(choice) => {
        setPreview(null);
        close();
        // Siempre en las settings del usuario: el tema es una preferencia de
        // la persona y no del proyecto, y escribirlo en el `.pastecode/` de un
        // repositorio se lo impondría a cualquiera que lo clone.
        void update('user', { window: { colorTheme: choice.id } });
      }}
      onClose={() => {
        // Cancelar restaura: el preview era prestado, no elegido.
        setPreview(null);
        close();
      }}
      placeholder={t('theme.placeholder')}
      label={t('theme.label')}
      emptyLabel={t('theme.empty')}
    />
  );
}

/** Los incorporados primero y los de extensión después, en un solo listado. */
function allChoices(
  contributed: readonly { id: string; label: string; extension: string }[]
): ThemeChoice[] {
  return [
    ...BUILT_IN_THEMES.map((theme) => ({
      id: theme.id,
      label: theme.label,
      origin: t('theme.builtIn'),
    })),
    ...contributed.map((theme) => ({
      id: theme.id,
      label: theme.label,
      origin: theme.extension,
    })),
  ];
}

/** Si un tema coincide con lo que se escribió. Sin fuzzy: son quince nombres. */
function matchesQuery(choice: ThemeChoice, query: string): boolean {
  return choice.label.toLowerCase().includes(query.trim().toLowerCase());
}
