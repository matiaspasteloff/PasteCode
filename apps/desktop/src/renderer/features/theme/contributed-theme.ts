import type { BuiltInTheme } from '@pastecode/core';
import type { ExtensionsChangedEvent } from '@pastecode/ipc-contract';

import { getLoadedMonaco } from '../editor/monaco-instance.js';

import { monacoThemeFor } from './use-theme.js';

/** Un tema aportado por una extensión, tal como llega del contrato. */
export type ContributedTheme = ExtensionsChangedEvent['themes'][number];

/**
 * Lo que hace falta para pintar un tema, venga de donde venga.
 *
 * Los incorporados de [ADR-0031](../../../../../../docs/adr/0031-temas-incorporados-como-datos.md)
 * y los de extensión entran por acá **con la misma función**: lo único que los
 * distingue es de dónde sale el descriptor, y un segundo camino de aplicación
 * sería un segundo lugar donde arreglar el mismo bug de pintado.
 */
export type ApplicableTheme = ContributedTheme | BuiltInTheme;

/**
 * El nombre con el que se registra en Monaco el tema de una extensión.
 *
 * Lleva prefijo por lo mismo que los comandos: sin él, un tema llamado `vs-dark`
 * pisaría el de fábrica de Monaco para toda la sesión.
 */
function monacoThemeName(id: string): string {
  return `pastecode-ext-${id}`;
}

/**
 * Aplica un tema aportado por una extensión.
 *
 * Escribe los colores como variables CSS en el `<html>`, que es exactamente lo
 * que ya hace el tema de fábrica: todo el color del IDE sale de
 * [`tokens.css`](../../styles/tokens.css), así que pisar variables repinta la
 * aplicación entera sin re-renderizar un solo componente. Es la misma mecánica
 * del cambio en caliente de [RF-801](../../../../../../docs/03-requerimientos-funcionales.md).
 *
 * **Los valores ya vienen validados como hex** desde el host. Sin eso, escribir
 * un color de terceros en un `style` sería dejar que una extensión inyecte
 * declaraciones CSS arbitrarias.
 *
 * @param theme El tema a aplicar.
 * @example
 * applyContributedTheme(nord);
 */
export function applyContributedTheme(theme: ApplicableTheme): void {
  const root = document.documentElement;

  // La base primero: lo que el tema no pisa se hereda del claro o del oscuro
  // de fábrica, así que un tema que sólo define un acento sigue siendo legible.
  root.dataset.theme = theme.uiTheme;

  for (const [token, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--color-${token}`, value);
  }

  applyToMonaco(theme);
}

/** Saca lo que haya puesto un tema de extensión y vuelve al de fábrica. */
export function clearContributedTheme(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;

  // Se recorre el `style` inline y no una lista fija: el tema anterior pudo
  // haber definido tokens que el nuevo no toca, y dejarlos puestos mezclaría
  // las dos paletas.
  for (const property of [...root.style]) {
    if (property.startsWith('--color-')) root.style.removeProperty(property);
  }

  root.dataset.theme = resolved;
  getLoadedMonaco()?.editor.setTheme(monacoThemeFor(resolved));
}

/**
 * Registra el tema en Monaco y lo activa.
 *
 * Sólo si Monaco ya está cargado: importarlo desde acá traería sus casi 4MB al
 * arrancar aunque no haya ningún archivo abierto, que es la misma razón por la
 * que `use-theme` tampoco lo importa.
 */
function applyToMonaco(theme: ApplicableTheme): void {
  const monaco = getLoadedMonaco();

  if (monaco === null) return;

  monaco.editor.defineTheme(monacoThemeName(theme.id), {
    base: theme.uiTheme === 'dark' ? 'vs-dark' : 'vs',
    // Hereda las reglas de la base: un tema que define cinco scopes no tiene
    // que quedarse sin resaltado en los otros ochenta.
    inherit: true,
    rules: theme.tokenColors.map((rule) => ({
      token: rule.token,
      // Monaco quiere el hex **sin** el `#`, a diferencia de CSS. Es la clase
      // de detalle que hace que un tema se vea sin colores y nadie sepa por qué.
      ...(rule.foreground === undefined
        ? {}
        : { foreground: rule.foreground.replace('#', '') }),
      ...(rule.fontStyle === undefined ? {} : { fontStyle: rule.fontStyle }),
    })),
    colors: {
      ...(theme.colors.background === undefined
        ? {}
        : { 'editor.background': theme.colors.background }),
      ...(theme.colors.foreground === undefined
        ? {}
        : { 'editor.foreground': theme.colors.foreground }),
    },
  });

  monaco.editor.setTheme(monacoThemeName(theme.id));
}
