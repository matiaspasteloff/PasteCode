import { blend } from './contrast.js';

/**
 * Los 16 colores ANSI de un tema, en el orden del estándar.
 *
 * Es una tupla y no un objeto de dieciséis claves porque el orden **es** el
 * dato: el estándar los numera del 0 al 15, y una tupla hace imposible
 * declarar quince.
 */
export type AnsiPalette = readonly [
  black: string,
  red: string,
  green: string,
  yellow: string,
  blue: string,
  magenta: string,
  cyan: string,
  white: string,
  brightBlack: string,
  brightRed: string,
  brightGreen: string,
  brightYellow: string,
  brightBlue: string,
  brightMagenta: string,
  brightCyan: string,
  brightWhite: string,
];

/**
 * Lo que hay que elegir para definir un tema.
 *
 * Son diecisiete colores y no los cincuenta y un tokens de `tokens.css`: el
 * resto **se deriva**. Los `-subtle` salen de mezclar su color semántico con
 * el fondo, los de Git y los de iconos son alias de los semánticos y de los
 * ANSI, y el anillo de foco es el acento. Pedir los cincuenta y uno nueve
 * veces sería pedir cuatrocientas cincuenta y nueve decisiones, y las
 * cuatrocientas que no importan se tomarían mal.
 */
export interface ThemePalette {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  foreground: string;
  muted: string;
  accent: string;
  /** Lo que se escribe **encima** de un relleno de acento. */
  accentContrast: string;
  selection: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  ansi: AnsiPalette;
  cursor: string;
  /** El color del texto **debajo** del cursor cuando es un bloque. */
  cursorAccent: string;
  terminalSelection: string;
}

/** Una regla de resaltado para Monaco. */
export interface TokenColorRule {
  token: string;
  foreground?: string | undefined;
  fontStyle?: string | undefined;
}

/**
 * Un tema incorporado, ya expandido.
 *
 * La forma coincide con la de un tema de extensión a propósito: los dos se
 * aplican por el mismo camino, que es la mitad de la decisión de
 * [ADR-0031](../../../../docs/adr/0031-temas-incorporados-como-datos.md). Lo
 * único que falta acá es el `extension` que lo aportó, porque a éstos no los
 * aporta ninguna.
 */
export interface BuiltInTheme {
  id: string;
  label: string;
  /** De qué base hereda lo que no pise. Nunca pisa nada, pero la base importa
   * igual: decide el `data-theme` del `<html>` y el tema base de Monaco. */
  uiTheme: 'light' | 'dark';
  /** Los tokens, sin el prefijo `--color-`. */
  colors: Readonly<Record<string, string>>;
  tokenColors: readonly TokenColorRule[];
}

/** Cuánto tiñe un color semántico su fondo `-subtle`. */
const SUBTLE_TINT = 0.14;

/**
 * Expande una paleta a los cincuenta y un tokens que la UI necesita.
 *
 * **Todo tema declara todas las claves, por construcción y no por disciplina.**
 * Un token que un tema no declara se hereda del claro o del oscuro de base, y
 * ahí es donde aparecen los acentos de otra paleta mezclados con la elegida.
 * Que salgan de acá hace imposible olvidarse de uno; el test lo verifica igual,
 * porque agregar un token a `tokens.css` y no agregarlo acá sigue siendo
 * posible.
 *
 * @param id El id con el que se guarda en `window.colorTheme`.
 * @param label Cómo se llama en el selector.
 * @param uiTheme Claro u oscuro, para la base.
 * @param palette Los diecisiete colores elegidos.
 * @returns El tema listo para aplicar.
 * @example
 * buildTheme('dracula', 'Dracula', 'dark', draculaPalette);
 */
export function buildTheme(
  id: string,
  label: string,
  uiTheme: 'light' | 'dark',
  palette: ThemePalette
): BuiltInTheme {
  return {
    id,
    label,
    uiTheme,
    colors: {
      ...surfaceTokens(palette),
      ...roleTokens(palette, uiTheme),
      ...terminalTokens(palette),
    },
    tokenColors: monacoRules(palette, uiTheme),
  };
}

/** Superficies, texto y acento: lo que se elige a mano. */
function surfaceTokens(palette: ThemePalette): Record<string, string> {
  return {
    background: palette.background,
    surface: palette.surface,
    'surface-raised': palette.surfaceRaised,
    'surface-sunken': palette.surfaceSunken,
    border: palette.border,
    foreground: palette.foreground,
    muted: palette.muted,
    accent: palette.accent,
    'accent-contrast': palette.accentContrast,
    selection: palette.selection,
    // El anillo de foco **es** el acento. Que sean dos tokens y no uno permite
    // separarlos algún día sin tocar cada `:focus-visible` del proyecto.
    'focus-ring': palette.accent,
  };
}

/**
 * Roles semánticos, Git e iconos: derivados de los cuatro semánticos y los ANSI.
 *
 * **Los ANSI se toman de la mitad brillante en los temas oscuros y de la
 * normal en los claros.** No es una preferencia estética: el rojo `#cc241d` de
 * Gruvbox sobre su propio fondo `#282828` no llega a 3:1, así que un icono de
 * archivo pintado con él es un icono que no se ve. La mitad brillante existe
 * justamente para eso.
 */
function roleTokens(palette: ThemePalette, uiTheme: 'light' | 'dark'): Record<string, string> {
  const shift = uiTheme === 'dark' ? 8 : 0;
  const ansi = (index: number): string => palette.ansi[index + shift] ?? palette.foreground;
  const subtle = (color: string): string => blend(color, palette.background, SUBTLE_TINT);

  return {
    danger: palette.danger,
    'danger-subtle': subtle(palette.danger),
    warning: palette.warning,
    'warning-subtle': subtle(palette.warning),
    success: palette.success,
    'success-subtle': subtle(palette.success),
    info: palette.info,
    'info-subtle': subtle(palette.info),
    // Que "modificado" sea el mismo amarillo que "advertencia" no es una
    // casualidad que convenga romper: son alias donde el significado coincide.
    'git-added': palette.success,
    'git-modified': palette.warning,
    'git-deleted': palette.danger,
    'git-untracked': ansi(6),
    // El naranja entre el rojo y el amarillo del tema. Un conflicto tiene que
    // distinguirse de un borrado, y reusar cualquier ANSI lo dejaría igual a
    // algún icono.
    'git-conflict': blend(palette.danger, palette.warning, 0.5),
    // Ocho roles y no ochenta lenguajes: un color por lenguaje es un mapa que
    // hay que mantener para siempre y que nadie lee.
    'icon-code': ansi(4),
    'icon-markup': ansi(1),
    'icon-style': palette.accent,
    'icon-data': ansi(2),
    'icon-doc': palette.muted,
    'icon-config': ansi(3),
    'icon-image': ansi(5),
    'icon-default': palette.muted,
  };
}

/** Los 16 ANSI, el cursor y la selección de la terminal. */
function terminalTokens(palette: ThemePalette): Record<string, string> {
  const names = [
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'bright-black',
    'bright-red',
    'bright-green',
    'bright-yellow',
    'bright-blue',
    'bright-magenta',
    'bright-cyan',
    'bright-white',
  ];

  return {
    'terminal-cursor': palette.cursor,
    'terminal-cursor-accent': palette.cursorAccent,
    'terminal-selection': palette.terminalSelection,
    ...Object.fromEntries(
      palette.ansi.map((color, index) => [`terminal-${names[index] ?? ''}`, color])
    ),
  };
}

/**
 * Las reglas de resaltado de Monaco, derivadas de la paleta.
 *
 * Nueve scopes y no los ochenta que define un tema de TextMate: `inherit: true`
 * hace que el resto salga de la base clara u oscura, así que lo que se declara
 * acá es lo que de verdad distingue a un tema de otro al mirar código.
 */
function monacoRules(palette: ThemePalette, uiTheme: 'light' | 'dark'): TokenColorRule[] {
  const shift = uiTheme === 'dark' ? 8 : 0;
  const ansi = (index: number): string => palette.ansi[index + shift] ?? palette.foreground;
  const [red, green, yellow, blue, magenta, cyan] = [1, 2, 3, 4, 5, 6].map(ansi);

  return [
    { token: 'comment', foreground: palette.muted, fontStyle: 'italic' },
    { token: 'string', foreground: green },
    { token: 'number', foreground: magenta },
    { token: 'constant', foreground: magenta },
    { token: 'keyword', foreground: palette.accent },
    { token: 'type', foreground: yellow },
    { token: 'function', foreground: blue },
    { token: 'tag', foreground: red },
    { token: 'attribute.name', foreground: cyan },
  ];
}
