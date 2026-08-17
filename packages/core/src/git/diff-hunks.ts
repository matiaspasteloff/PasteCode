/** Qué le pasó a un bloque de líneas del archivo. */
export type DiffHunkKind = 'added' | 'modified' | 'deleted';

/** Un bloque contiguo de líneas cambiadas, en coordenadas del archivo actual. */
export interface DiffHunk {
  /** Primera línea afectada, **base 1**, como todo el contrato. */
  readonly startLine: number;
  /**
   * Cuántas líneas abarca en el archivo actual.
   *
   * Un borrado abarca **cero**: lo que se borró no está, y la marca va en el
   * borde entre las dos líneas que quedaron pegadas. Es exactamente lo que
   * dibujan el resto de los editores, y por eso el conteo tiene que poder ser
   * cero en vez de mentir con un 1.
   */
  readonly lineCount: number;
  readonly kind: DiffHunkKind;
}

/** `@@ -a,b +c,d @@`. Los conteos son opcionales y valen 1 cuando faltan. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Lee las cabeceras `@@` de un `git diff -U0`.
 *
 * **No se escribe un algoritmo de diff**, y ésa es toda la decisión: quince
 * líneas de función pura contra unas sesenta de Myers más una lectura del
 * contenido base de cada archivo. Y además coincide **exactamente** con lo que
 * git considera cambiado, incluidos el `diff.algorithm` y la configuración de
 * whitespace de la persona, que un diff propio contradiría en los casos raros
 * —que son justo los que se notan—.
 *
 * El `-U0` es lo que lo hace posible: sin líneas de contexto, cada cabecera es
 * exactamente el rango que cambió.
 *
 * @param diff La salida de `git diff --no-color -U0`.
 * @returns Los bloques, en el orden en que git los escribió.
 * @example
 * parseDiffHunks('@@ -1,2 +1,3 @@\n'); // [{ startLine: 1, lineCount: 3, kind: 'modified' }]
 */
export function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];

  for (const line of diff.split('\n')) {
    const match = HUNK_HEADER.exec(line);

    if (match === null) continue;

    const hunk = toHunk(match);

    if (hunk !== null) hunks.push(hunk);
  }

  return hunks;
}

/** Traduce una cabecera ya parseada. `null` si no describe ningún cambio. */
function toHunk(match: RegExpExecArray): DiffHunk | null {
  const removed = countOf(match[2]);
  const newStart = Number(match[3]);
  const added = countOf(match[4]);

  if (removed === 0 && added === 0) return null;

  // Sin líneas nuevas es un borrado puro: git escribe como `+c` la línea
  // **anterior** al hueco, así que la marca va ahí. El `max(1)` cubre el caso
  // de borrar desde la primera línea, donde git escribe `+0`.
  if (added === 0) {
    return { startLine: Math.max(1, newStart), lineCount: 0, kind: 'deleted' };
  }

  return {
    startLine: newStart,
    lineCount: added,
    kind: removed === 0 ? 'added' : 'modified',
  };
}

/** El conteo de una cabecera. Ausente significa exactamente una línea. */
function countOf(raw: string | undefined): number {
  return raw === undefined ? 1 : Number(raw);
}
