import { z } from 'zod';

/**
 * Un breakpoint, tal como lo pone alguien en el gutter.
 *
 * **Es el tipo que `WorkspaceState` viene declarando desde la Etapa 3 sin que
 * existiera.** El schema laxo de la sesión existe justamente para que este
 * campo pudiera aparecer sin migración ni bump de versión.
 *
 * La línea es **base 1**, como todo el resto del proyecto. DAP también habla
 * base 1 en `setBreakpoints`, así que acá no hay traducción — a diferencia de
 * LSP, que habla base 0 y tiene sus dos funciones de ±1 en `lsp/positions.ts`.
 */
export const BreakpointSchema = z.strictObject({
  /** Ruta absoluta del archivo. */
  path: z.string().min(1),
  /** Línea base 1. */
  line: z.int().min(1),
  /**
   * Si está activo.
   *
   * Un breakpoint desactivado **se guarda igual**: apagarlo es distinto de
   * borrarlo, y quien apaga uno para probar algo espera encontrarlo cuando
   * vuelve.
   */
  enabled: z.boolean(),
  /**
   * Expresión que tiene que dar verdadero para frenar. Opcional.
   *
   * Se manda en el `condition` de DAP. Si el adaptador no declara
   * `supportsConditionalBreakpoints`, la condición se ignora del lado del
   * adaptador y el breakpoint frena siempre: es él quien decide, no nosotros.
   */
  condition: z.string().min(1).optional(),
});

export type Breakpoint = z.infer<typeof BreakpointSchema>;

/**
 * Pone o saca un breakpoint en una línea.
 *
 * Es lo que hace un click en el gutter ([RF-502](../../../../docs/03-requerimientos-funcionales.md)).
 * Devuelve una lista nueva en vez de mutar: la lista vive en un store del
 * renderer y en el estado de la sesión, y mutarla dejaría a los dos mirando el
 * mismo array sin que nadie se entere.
 *
 * @param breakpoints Los que hay ahora.
 * @param path Ruta absoluta del archivo.
 * @param line Línea base 1.
 * @returns La lista nueva, con uno más o uno menos.
 * @example
 * toggleBreakpoint([], 'C:\\p\\a.ts', 12); // [{ path, line: 12, enabled: true }]
 */
export function toggleBreakpoint(
  breakpoints: readonly Breakpoint[],
  path: string,
  line: number
): Breakpoint[] {
  const existing = breakpoints.find(
    (breakpoint) => breakpoint.path === path && breakpoint.line === line
  );

  if (existing !== undefined) {
    return breakpoints.filter((breakpoint) => breakpoint !== existing);
  }

  return [...breakpoints, { path, line, enabled: true }];
}

/**
 * Los breakpoints de un archivo, ordenados por línea.
 *
 * Ordenados porque es lo que el `setBreakpoints` de DAP recibe y lo que la UI
 * dibuja, y porque un orden estable hace comparables dos listas iguales.
 *
 * @param breakpoints Todos los del workspace.
 * @param path Ruta absoluta del archivo.
 * @returns Los de ese archivo, de arriba hacia abajo.
 * @example
 * breakpointsIn(all, 'C:\\p\\a.ts');
 */
export function breakpointsIn(breakpoints: readonly Breakpoint[], path: string): Breakpoint[] {
  return breakpoints
    .filter((breakpoint) => breakpoint.path === path)
    .sort((left, right) => left.line - right.line);
}

/**
 * Las rutas que tienen al menos un breakpoint.
 *
 * DAP no tiene "borrá el breakpoint de la línea 12": `setBreakpoints` reemplaza
 * **todos** los de un archivo de una vez. Así que sacar el último de un archivo
 * obliga a mandarle ese archivo con la lista vacía, y para eso hay que saber
 * cuáles se tocaron alguna vez.
 *
 * @param breakpoints Todos los del workspace.
 * @returns Las rutas, sin repetir.
 * @example
 * pathsWithBreakpoints(all); // ['C:\\p\\a.ts', 'C:\\p\\b.ts']
 */
export function pathsWithBreakpoints(breakpoints: readonly Breakpoint[]): string[] {
  return [...new Set(breakpoints.map((breakpoint) => breakpoint.path))];
}

/**
 * Corre los breakpoints de un archivo cuando se le insertan o borran líneas.
 *
 * Sin esto, editar arriba de un breakpoint lo deja apuntando a otra línea, y el
 * debugger frena en un lugar que no es. Es el mismo problema que resuelven los
 * decoradores de Monaco mientras el archivo está abierto; esto es para lo que
 * pasa **afuera** del editor: un cambio en disco, un `git checkout`.
 *
 * Un breakpoint que cae **adentro** del rango borrado se descarta: la línea que
 * marcaba ya no existe, y moverlo a la de al lado sería inventar una intención.
 *
 * @param breakpoints Los del archivo.
 * @param fromLine Primera línea afectada, base 1.
 * @param removedLines Cuántas líneas se borraron desde ahí.
 * @param addedLines Cuántas se agregaron en su lugar.
 * @returns Los breakpoints ya corridos.
 * @example
 * shiftBreakpoints(list, 5, 0, 2); // los de la línea 5 en adelante bajan dos
 */
export function shiftBreakpoints(
  breakpoints: readonly Breakpoint[],
  fromLine: number,
  removedLines: number,
  addedLines: number
): Breakpoint[] {
  const delta = addedLines - removedLines;

  return breakpoints.flatMap((breakpoint) => {
    if (breakpoint.line < fromLine) return [breakpoint];

    // Cayó adentro de lo que se borró: la línea que marcaba ya no existe.
    if (breakpoint.line < fromLine + removedLines) return [];

    return [{ ...breakpoint, line: breakpoint.line + delta }];
  });
}
