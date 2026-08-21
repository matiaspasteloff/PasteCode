import type { BuiltInTheme, ThemePalette } from './palette.js';
import { buildTheme } from './palette.js';

/**
 * Los nueve temas incorporados, como **datos**.
 *
 * No son extensiones empaquetadas, y ésa es la decisión de
 * [ADR-0031](../../../../docs/adr/0031-temas-incorporados-como-datos.md): una
 * extensión cuesta un proceso de host vivo para pintar la app, y un tema de
 * fábrica que no carga es un IDE sin colores. Se aplican por el **mismo
 * camino** que los de extensión, así que no hay mecanismo nuevo.
 *
 * Cada uno declara diecisiete colores y `buildTheme` expande los cincuenta y
 * uno que la UI necesita. Los valores son los de la paleta original de cada
 * tema salvo donde `built-in-themes.test.ts` encontró que no llegaban al
 * contraste de RNF-22; esos ajustes están marcados uno por uno.
 */

/** Dracula. El acento es su violeta característico. */
const DRACULA: ThemePalette = {
  background: '#282a36',
  surface: '#21222c',
  surfaceRaised: '#343746',
  surfaceSunken: '#191a21',
  border: '#44475a',
  foreground: '#f8f8f2',
  // El `#6272a4` original —el color de sus comentarios— da 2,8:1 sobre el
  // fondo. Se aclara al mínimo necesario para llegar a 4,5:1 (RNF-22).
  muted: '#9aa5cf',
  accent: '#bd93f9',
  accentContrast: '#282a36',
  selection: '#44475a',
  danger: '#ff6e6e',
  warning: '#ffffa5',
  success: '#69ff94',
  info: '#a4ffff',
  ansi: [
    '#21222c',
    '#ff5555',
    '#50fa7b',
    '#f1fa8c',
    '#bd93f9',
    '#ff79c6',
    '#8be9fd',
    '#f8f8f2',
    '#6272a4',
    '#ff6e6e',
    '#69ff94',
    '#ffffa5',
    '#d6acff',
    '#ff92df',
    '#a4ffff',
    '#ffffff',
  ],
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  terminalSelection: '#44475a',
};

/** One Dark, el de Atom. */
const ONE_DARK: ThemePalette = {
  background: '#282c34',
  surface: '#21252b',
  surfaceRaised: '#323842',
  surfaceSunken: '#1b1f24',
  border: '#3e4451',
  foreground: '#dcdfe4',
  muted: '#9da5b4',
  accent: '#61afef',
  accentContrast: '#282c34',
  selection: '#3e4451',
  danger: '#ff616e',
  warning: '#f0a45d',
  success: '#a5e075',
  info: '#4dc4ff',
  ansi: [
    '#3f4451',
    '#e06c75',
    '#98c379',
    '#e5c07b',
    '#61afef',
    '#c678dd',
    '#56b6c2',
    '#abb2bf',
    '#4f5666',
    '#ff616e',
    '#a5e075',
    '#f0a45d',
    '#4dc4ff',
    '#de73ff',
    '#4cd1e0',
    '#e6e6e6',
  ],
  cursor: '#dcdfe4',
  cursorAccent: '#282c34',
  terminalSelection: '#3e4451',
};

/** Tokyo Night. */
const TOKYO_NIGHT: ThemePalette = {
  background: '#1a1b26',
  surface: '#16161e',
  surfaceRaised: '#24283b',
  surfaceSunken: '#101014',
  border: '#3b4261',
  foreground: '#c0caf5',
  muted: '#9aa5ce',
  accent: '#7aa2f7',
  accentContrast: '#1a1b26',
  selection: '#33467c',
  danger: '#ff7a93',
  warning: '#ff9e64',
  success: '#b9f27c',
  info: '#7dcfff',
  ansi: [
    '#15161e',
    '#f7768e',
    '#9ece6a',
    '#e0af68',
    '#7aa2f7',
    '#bb9af7',
    '#7dcfff',
    '#a9b1d6',
    '#414868',
    '#ff7a93',
    '#b9f27c',
    '#ff9e64',
    '#8db0ff',
    '#c7a9ff',
    '#a4daff',
    '#c0caf5',
  ],
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  terminalSelection: '#33467c',
};

/** Gruvbox, en su variante oscura. */
const GRUVBOX: ThemePalette = {
  background: '#282828',
  surface: '#1d2021',
  surfaceRaised: '#3c3836',
  surfaceSunken: '#161819',
  border: '#504945',
  foreground: '#ebdbb2',
  // `fg4` (#a89984) da 4,2:1 sobre la superficie elevada; se sube a `fg3`.
  muted: '#bdae93',
  accent: '#d3869b',
  accentContrast: '#282828',
  selection: '#504945',
  // `bright red` (#fb4934) da 4,3:1 sobre el fondo; se aclara lo mínimo.
  danger: '#ff6656',
  warning: '#fabd2f',
  success: '#b8bb26',
  info: '#83a598',
  ansi: [
    '#282828',
    '#cc241d',
    '#98971a',
    '#d79921',
    '#458588',
    '#b16286',
    '#689d6a',
    '#a89984',
    '#928374',
    '#fb4934',
    '#b8bb26',
    '#fabd2f',
    '#83a598',
    '#d3869b',
    '#8ec07c',
    '#ebdbb2',
  ],
  cursor: '#ebdbb2',
  cursorAccent: '#282828',
  terminalSelection: '#504945',
};

/** Monokai. */
const MONOKAI: ThemePalette = {
  background: '#272822',
  surface: '#1e1f1c',
  surfaceRaised: '#34352f',
  surfaceSunken: '#171812',
  border: '#49483e',
  foreground: '#f8f8f2',
  muted: '#a6a48f',
  accent: '#a6e22e',
  accentContrast: '#272822',
  selection: '#49483e',
  danger: '#ff6188',
  warning: '#e6db74',
  success: '#a6e22e',
  info: '#78dce8',
  ansi: [
    '#272822',
    '#f92672',
    '#a6e22e',
    '#e6db74',
    '#66d9ef',
    '#ae81ff',
    '#a1efe4',
    '#f8f8f2',
    '#75715e',
    '#ff6188',
    '#b7e453',
    '#f0e68c',
    '#78dce8',
    '#c5a0ff',
    '#b5f2e8',
    '#ffffff',
  ],
  cursor: '#f8f8f2',
  cursorAccent: '#272822',
  terminalSelection: '#49483e',
};

/**
 * Solarized, en su variante clara.
 *
 * **Es el más justo de contraste de los nueve**, y es un problema conocido de
 * la paleta original: su `base00` sobre `base3` roza el 4,5:1 y varios de sus
 * acentos no llegan. Donde no llegaba se oscureció el token lo mínimo
 * necesario en vez de bajar el umbral de RNF-22: el umbral es el requisito, la
 * paleta es la implementación.
 */
const SOLARIZED_LIGHT: ThemePalette = {
  background: '#fdf6e3',
  surface: '#eee8d5',
  surfaceRaised: '#fdf6e3',
  surfaceSunken: '#e4ddca',
  border: '#d3cbb7',
  foreground: '#073642',
  // `base01` (#586e75) da 4,4:1 sobre `base2`; se oscurece lo mínimo.
  muted: '#4c6067',
  // `blue` (#268bd2) da 3,2:1 sobre el fondo claro; se oscurece. El mismo
  // valor va al ANSI azul, que es de donde sale el color de los iconos.
  accent: '#186296',
  accentContrast: '#fdf6e3',
  selection: '#ddd6c1',
  danger: '#b5372c',
  warning: '#8a6100',
  success: '#4f6a00',
  info: '#186296',
  ansi: [
    '#073642',
    '#b5372c',
    '#4f6a00',
    '#8a6100',
    '#186296',
    '#a32b6f',
    '#146a61',
    '#eee8d5',
    '#002b36',
    '#8f2a1f',
    '#3d5200',
    '#6d4c00',
    '#155681',
    '#7f2156',
    '#12615a',
    '#fdf6e3',
  ],
  cursor: '#073642',
  cursorAccent: '#fdf6e3',
  terminalSelection: '#ddd6c1',
};

/** Solarized, en su variante oscura. Mismo criterio de ajuste que la clara. */
const SOLARIZED_DARK: ThemePalette = {
  background: '#002b36',
  surface: '#073642',
  surfaceRaised: '#0d4552',
  surfaceSunken: '#00212a',
  border: '#15525f',
  foreground: '#eee8d5',
  // `base1` (#93a1a1) da 4,0:1 sobre la superficie elevada; se aclara.
  muted: '#a9b6b6',
  accent: '#41a5e8',
  accentContrast: '#002b36',
  selection: '#0f4b58',
  // El rojo brillante da 3,9:1 sobre `base02`, que es la superficie de los
  // paneles donde Git pinta el nombre de un archivo borrado. Se aclara.
  danger: '#ff8674',
  warning: '#d4a017',
  success: '#8fbb00',
  info: '#41a5e8',
  ansi: [
    '#073642',
    '#dc322f',
    '#859900',
    '#b58900',
    '#268bd2',
    '#d33682',
    '#2aa198',
    '#eee8d5',
    '#586e75',
    '#ff8674',
    '#8fbb00',
    '#d4a017',
    '#41a5e8',
    '#e2589a',
    '#3fc4b8',
    '#fdf6e3',
  ],
  cursor: '#eee8d5',
  cursorAccent: '#002b36',
  terminalSelection: '#0f4b58',
};

/** Catppuccin Mocha. */
const CATPPUCCIN_MOCHA: ThemePalette = {
  background: '#1e1e2e',
  surface: '#181825',
  surfaceRaised: '#313244',
  surfaceSunken: '#11111b',
  border: '#45475a',
  foreground: '#cdd6f4',
  muted: '#a6adc8',
  accent: '#cba6f7',
  accentContrast: '#1e1e2e',
  selection: '#414458',
  danger: '#f38ba8',
  warning: '#f9e2af',
  success: '#a6e3a1',
  info: '#89dceb',
  ansi: [
    '#45475a',
    '#f38ba8',
    '#a6e3a1',
    '#f9e2af',
    '#89b4fa',
    '#f5c2e7',
    '#94e2d5',
    '#bac2de',
    '#585b70',
    '#f5a3bb',
    '#b9e8b5',
    '#fbe9c3',
    '#a3c4fb',
    '#f7d0ec',
    '#a9e8de',
    '#cdd6f4',
  ],
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  terminalSelection: '#414458',
};

/**
 * Alto contraste.
 *
 * No es una paleta de terceros: es la respuesta a
 * [RNF-22](../../../../docs/04-requerimientos-no-funcionales.md) para quien
 * necesita más de lo que el mínimo exige. Todo par pasa 7:1 —el nivel AAA—
 * salvo donde el propio color lo impide, y los bordes son visibles a propósito.
 */
const HIGH_CONTRAST: ThemePalette = {
  background: '#000000',
  surface: '#000000',
  surfaceRaised: '#0d0d0d',
  surfaceSunken: '#000000',
  border: '#8a8a8a',
  foreground: '#ffffff',
  muted: '#d0d0d0',
  accent: '#6fc3ff',
  accentContrast: '#000000',
  selection: '#264f78',
  danger: '#ff8f8f',
  warning: '#ffd75f',
  success: '#7ff58f',
  info: '#6fc3ff',
  ansi: [
    '#000000',
    '#ff8f8f',
    '#7ff58f',
    '#ffd75f',
    '#6fc3ff',
    '#ff9ff0',
    '#7ff5f5',
    '#e6e6e6',
    '#6b6b6b',
    '#ffb3b3',
    '#a8ffb5',
    '#ffe699',
    '#a3d9ff',
    '#ffc2f5',
    '#a8ffff',
    '#ffffff',
  ],
  cursor: '#ffffff',
  cursorAccent: '#000000',
  terminalSelection: '#264f78',
};

/**
 * Los temas incorporados, en el orden en que los lista el selector.
 *
 * **Agregar uno es agregar una entrada acá.** No hay nada más que tocar: el
 * schema de settings ya guarda un id (`window.colorTheme`), el selector recorre
 * esta lista, y aplicarlo es el mismo camino que un tema de extensión.
 *
 * @example
 * BUILT_IN_THEMES.find((theme) => theme.id === settings.window.colorTheme);
 */
export const BUILT_IN_THEMES: readonly BuiltInTheme[] = [
  buildTheme('dracula', 'Dracula', 'dark', DRACULA),
  buildTheme('one-dark', 'One Dark', 'dark', ONE_DARK),
  buildTheme('tokyo-night', 'Tokyo Night', 'dark', TOKYO_NIGHT),
  buildTheme('gruvbox', 'Gruvbox', 'dark', GRUVBOX),
  buildTheme('monokai', 'Monokai', 'dark', MONOKAI),
  buildTheme('catppuccin-mocha', 'Catppuccin Mocha', 'dark', CATPPUCCIN_MOCHA),
  buildTheme('solarized-light', 'Solarized Light', 'light', SOLARIZED_LIGHT),
  buildTheme('solarized-dark', 'Solarized Dark', 'dark', SOLARIZED_DARK),
  buildTheme('high-contrast', 'Alto Contraste', 'dark', HIGH_CONTRAST),
];

/**
 * Un tema incorporado por su id, o `undefined`.
 *
 * @param id El id guardado en `window.colorTheme`.
 * @returns El tema, o `undefined` si el id es de un tema de extensión o basura.
 * @example
 * builtInTheme('dracula');
 */
export function builtInTheme(id: string): BuiltInTheme | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}
