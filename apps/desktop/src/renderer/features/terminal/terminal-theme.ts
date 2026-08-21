import type { ITheme } from '@xterm/xterm';

/**
 * Los 16 nombres de color ANSI, en el orden en que los numera el estándar.
 *
 * El nombre del token es `--color-terminal-<nombre>`, así que un tema
 * incorporado o uno de extensión los pisa por el mismo camino que cualquier
 * otro color: escribiendo variables CSS en el `<html>`. Sin mecanismo nuevo.
 */
type AnsiName =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'bright-black'
  | 'bright-red'
  | 'bright-green'
  | 'bright-yellow'
  | 'bright-blue'
  | 'bright-magenta'
  | 'bright-cyan'
  | 'bright-white';

/**
 * El tema de xterm que corresponde al tema activo de la aplicación.
 *
 * **Los 16 ANSI salen del tema y no de la paleta de fábrica de xterm.** Antes
 * sólo se le pasaban el fondo y el texto, así que un tema oscuro dejaba la
 * salida de `git status` con los verdes y rojos por defecto de xterm, que no
 * pertenecen a ninguna paleta y encima cambian de legibilidad según el fondo.
 *
 * Se lee del `getComputedStyle` del host y no de una tabla en JavaScript
 * porque es el mismo lugar del que sale todo el color del IDE: cambiar de tema
 * escribe variables en el `<html>` y esto las vuelve a leer. Es lo que hace
 * que la terminal siga a RF-801 sin una línea de código de temas.
 *
 * @param host El contenedor de la terminal, ya en el DOM.
 * @returns El tema para pasarle a xterm.
 * @example
 * new Terminal({ theme: terminalTheme(host) });
 */
export function terminalTheme(host: HTMLElement): ITheme {
  const styles = getComputedStyle(host);
  const read = (token: string): string => styles.getPropertyValue(token).trim();
  const ansi = (name: AnsiName): string => read(`--color-terminal-${name}`);

  return {
    background: read('--color-surface'),
    foreground: read('--color-foreground'),
    // El cursor y la selección también: sin ellos, el cursor queda blanco
    // sobre un tema claro y directamente no se ve.
    cursor: read('--color-terminal-cursor'),
    cursorAccent: read('--color-terminal-cursor-accent'),
    selectionBackground: read('--color-terminal-selection'),
    black: ansi('black'),
    red: ansi('red'),
    green: ansi('green'),
    yellow: ansi('yellow'),
    blue: ansi('blue'),
    magenta: ansi('magenta'),
    cyan: ansi('cyan'),
    white: ansi('white'),
    brightBlack: ansi('bright-black'),
    brightRed: ansi('bright-red'),
    brightGreen: ansi('bright-green'),
    brightYellow: ansi('bright-yellow'),
    brightBlue: ansi('bright-blue'),
    brightMagenta: ansi('bright-magenta'),
    brightCyan: ansi('bright-cyan'),
    brightWhite: ansi('bright-white'),
  };
}
