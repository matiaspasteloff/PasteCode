/**
 * Tamaño de la grilla de una terminal, en celdas.
 */
export interface TerminalDimensions {
  cols: number;
  rows: number;
}

/**
 * Mínimo con el que un shell sigue siendo usable.
 *
 * Por debajo de 20 columnas, un prompt de PowerShell con la ruta del workspace
 * ya no entra y conpty empieza a envolver en lugares raros. No es un número
 * medido: es el piso por debajo del cual la terminal deja de servir para algo,
 * y existe porque xterm reporta tamaños absurdos mientras el panel se abre.
 */
const MINIMUM: TerminalDimensions = { cols: 20, rows: 5 };

/**
 * Techo, para que un bug de layout no le pida a conpty una grilla gigante.
 *
 * conpty reserva un buffer proporcional al tamaño, así que un `cols: 1e9`
 * llegado desde un `offsetWidth` mal medido no es un error de dibujo: es una
 * reserva de memoria en el proceso del main.
 */
const MAXIMUM: TerminalDimensions = { cols: 1000, rows: 500 };

/**
 * Ajusta un tamaño reportado por el renderer a algo que un PTY pueda usar.
 *
 * Existe porque el renderer mide un panel del DOM y el PTY necesita una grilla
 * de verdad, y esas dos cosas no coinciden en dos momentos: cuando el panel
 * todavía no tiene alto —xterm reporta 0 o 2 filas— y cuando el usuario
 * arrastra el divisor hasta el borde. Redondear hacia abajo es lo correcto:
 * una fila de más es una fila que el shell escribe y no se ve.
 *
 * No valida: eso lo hace el schema del canal, que rechaza un `cols: -1` porque
 * eso no es un panel chico, es el renderer mandando algo imposible.
 *
 * @param dimensions Lo que reportó xterm.
 * @returns Un tamaño entero dentro de rango.
 * @example
 * clampDimensions({ cols: 2, rows: 0 });      // { cols: 20, rows: 5 }
 * clampDimensions({ cols: 80.7, rows: 24 });  // { cols: 80, rows: 24 }
 */
export function clampDimensions(dimensions: TerminalDimensions): TerminalDimensions {
  return {
    cols: clamp(dimensions.cols, MINIMUM.cols, MAXIMUM.cols),
    rows: clamp(dimensions.rows, MINIMUM.rows, MAXIMUM.rows),
  };
}

/** Acota un número a un rango, redondeando hacia abajo. */
function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;

  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}
