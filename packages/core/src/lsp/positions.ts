/**
 * Una posición en un documento, **base 1** en línea y en columna.
 *
 * Base 1 porque es lo que ya hablan `SearchMatch` y `TabState`, y tener dos
 * convenciones adentro del mismo contrato es garantizar que en algún lado se
 * mezclen. LSP habla base 0; la traducción vive abajo y no se hace en ningún
 * otro lado.
 */
export interface DocumentPosition {
  readonly line: number;
  readonly column: number;
}

/** Un rango del documento, en las mismas coordenadas base 1. */
export interface DocumentRange {
  readonly start: DocumentPosition;
  readonly end: DocumentPosition;
}

/** La forma base 0 que habla el protocolo. */
export interface LspPosition {
  readonly line: number;
  readonly character: number;
}

/** Un rango del protocolo, base 0. */
export interface LspRange {
  readonly start: LspPosition;
  readonly end: LspPosition;
}

/**
 * Traduce una posición del contrato a la del protocolo.
 *
 * Es una de las dos únicas funciones del proyecto que restan uno, y por eso
 * están las dos acá con su test: un error de ±1 en LSP no rompe nada de forma
 * visible, subraya la palabra de al lado. Un único lugar donde estar es un
 * único lugar donde mirar.
 *
 * @param position Posición base 1.
 * @returns La misma posición, base 0.
 * @example
 * toLspPosition({ line: 1, column: 1 }); // { line: 0, character: 0 }
 */
export function toLspPosition(position: DocumentPosition): LspPosition {
  return {
    // El máximo con 0 no es defensivo por gusto: el renderer manda lo que le
    // dio Monaco, y una posición de un modelo recién disposeado puede llegar
    // en 0. Mandarle `-1` a un servidor de lenguaje es indefinido por spec.
    line: Math.max(0, position.line - 1),
    character: Math.max(0, position.column - 1),
  };
}

/**
 * Traduce una posición del protocolo a la del contrato.
 *
 * @param position Posición base 0.
 * @returns La misma posición, base 1.
 * @example
 * fromLspPosition({ line: 0, character: 0 }); // { line: 1, column: 1 }
 */
export function fromLspPosition(position: LspPosition): DocumentPosition {
  return {
    line: Math.max(0, position.line) + 1,
    column: Math.max(0, position.character) + 1,
  };
}

/**
 * Traduce un rango del contrato al del protocolo.
 *
 * @param range Rango base 1.
 * @returns El mismo rango, base 0.
 * @example
 * toLspRange({ start: { line: 1, column: 1 }, end: { line: 1, column: 5 } });
 */
export function toLspRange(range: DocumentRange): LspRange {
  return { start: toLspPosition(range.start), end: toLspPosition(range.end) };
}

/**
 * Traduce un rango del protocolo al del contrato.
 *
 * @param range Rango base 0.
 * @returns El mismo rango, base 1.
 * @example
 * fromLspRange({ start: { line: 0, character: 0 }, end: { line: 0, character: 4 } });
 */
export function fromLspRange(range: LspRange): DocumentRange {
  return { start: fromLspPosition(range.start), end: fromLspPosition(range.end) };
}
