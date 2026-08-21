import { builtInTheme } from '@pastecode/core';
import { useEffect } from 'react';

import { useExtensionsStore } from '../../stores/extensions-store.js';
import { useSettingsStore } from '../../stores/settings-store.js';
import { useThemeStore, type ResolvedTheme } from '../../stores/theme-store.js';
import { getLoadedMonaco } from '../editor/monaco-instance.js';

import { applyContributedTheme, clearContributedTheme } from './contributed-theme.js';

/**
 * Aplica el tema al documento y a Monaco.
 *
 * **`window.theme: "system"` no necesita IPC.** `matchMedia` en el renderer ya
 * sigue al sistema operativo en Electron, así que RF-802 sale sin agregar
 * nada. Vale la pena decirlo porque la alternativa obvia —`nativeTheme` en el
 * main— obligaría a darle al preload un canal de eventos main → renderer que
 * hoy no existe, y esa superficie nueva merece su propio ADR. Cuando llegue la
 * barra de título custom, que sí lo necesita, se hace bien.
 *
 * El cambio en caliente que pide [RF-801](../../../../../../docs/03-requerimientos-funcionales.md)
 * sale de que todo el color está en variables CSS: se escribe un atributo en
 * el `<html>` y repinta la aplicación entera, sin re-renderizar componentes.
 *
 * @example
 * useTheme(); // una vez, en el cascarón de la app
 */
export function useTheme(): void {
  const theme = useThemeStore((state) => state.theme);
  const colorTheme = useSettingsStore((state) => state.settings.window.colorTheme);
  const themes = useExtensionsStore((state) => state.themes);
  const preview = useThemeStore((state) => state.preview);
  // Los incorporados y los de extensión comparten el mismo lookup: el schema
  // de settings no cambió, `window.colorTheme` sigue siendo un id (ADR-0031).
  // Un id que no corresponde a ninguno se ignora, y eso es lo que hace que una
  // extensión desinstalada no deje al IDE sin colores.
  const chosen = preview ?? colorTheme;
  const applicable =
    builtInTheme(chosen) ?? themes.find((candidate) => candidate.id === chosen);

  useEffect(() => {
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');

    const apply = (): void => {
      const resolved: ResolvedTheme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;

      // Un tema con nombre gana sobre claro/oscuro, pero se dibuja **encima**
      // de uno de los dos: lo que no pisa lo hereda de la base, así que un tema
      // de extensión que sólo define un acento sigue siendo legible (RF-906).
      // Los incorporados declaran todo, así que no heredan nada.
      if (applicable !== undefined) {
        applyContributedTheme(applicable);
        return;
      }

      clearContributedTheme(resolved);

      // Sólo si Monaco ya está cargado. Importarlo desde acá traería sus casi
      // 4MB al arrancar aunque no haya ningún archivo abierto, y el editor ya
      // toma el tema activo al crearse.
      getLoadedMonaco()?.editor.setTheme(monacoThemeFor(resolved));
    };

    apply();

    // Sólo hace falta escuchar al sistema cuando le estamos haciendo caso.
    if (theme !== 'system') return undefined;

    media.addEventListener('change', apply);

    return () => {
      media.removeEventListener('change', apply);
    };
  }, [theme, applicable]);
}

/**
 * El nombre del tema de Monaco que corresponde al tema de la aplicación.
 *
 * @param resolved El tema ya resuelto.
 * @returns El nombre que entiende `monaco.editor.setTheme`.
 * @example
 * monacoThemeFor('dark'); // 'vs-dark'
 */
export function monacoThemeFor(resolved: ResolvedTheme): string {
  return resolved === 'dark' ? 'vs-dark' : 'vs';
}

/**
 * El tema que está aplicado ahora mismo, leído del DOM.
 *
 * El editor lo consulta al crearse para nacer con el tema correcto en vez de
 * parpadear en claro y corregirse después.
 *
 * @returns El tema aplicado.
 * @example
 * monaco.editor.create(container, { theme: monacoThemeFor(currentResolvedTheme()) });
 */
export function currentResolvedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
