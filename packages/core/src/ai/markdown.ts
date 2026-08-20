/** Un tramo de la respuesta: prosa o un bloque de código. */
export type MarkdownBlock =
  { kind: 'prose'; text: string } | { kind: 'code'; language: string; code: string };

/** La cerca de un bloque de código. Tres backticks, como en CommonMark. */
const FENCE = '```';

/**
 * Parte un texto en prosa y bloques de código.
 *
 * **Es todo el markdown que el asistente necesita, y es a propósito.** Lo
 * único que la UI hace distinto con una parte del texto es el bloque de
 * código: monoespaciada, resaltado, y los botones de copiar, insertar y
 * reemplazar de [RF-1008](../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental).
 * Negritas, listas y encabezados se leen bien tal cual. Meter una librería de
 * markdown por eso sería sumar decenas de kilobytes contra el techo de RNF-05
 * —y su superficie de `dangerouslySetInnerHTML`— para renderizar asteriscos.
 *
 * Se corre **sobre texto que todavía está llegando**, así que una cerca sin
 * cerrar no es un error: es un bloque que se sigue escribiendo. Se devuelve
 * como bloque de código igual, y por eso la respuesta se ve con formato
 * mientras se escribe en vez de saltar al final.
 *
 * El lenguaje es lo que venga después de la cerca de apertura, recortado. Un
 * bloque sin lenguaje devuelve `''`.
 *
 * @param text El texto de la respuesta, completo o parcial.
 * @returns Los tramos, en orden. Los de prosa vacía se descartan.
 * @example
 * splitMarkdown('Mirá:\n```ts\nconst x = 1;\n```');
 * // [{ kind: 'prose', text: 'Mirá:' }, { kind: 'code', language: 'ts', code: 'const x = 1;' }]
 */
export function splitMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split('\n');

  let prose: string[] = [];
  let code: string[] | null = null;
  let language = '';

  const flushProse = (): void => {
    const joined = prose.join('\n').trim();

    if (joined !== '') blocks.push({ kind: 'prose', text: joined });

    prose = [];
  };

  for (const line of lines) {
    if (!line.trimStart().startsWith(FENCE)) {
      if (code === null) prose.push(line);
      else code.push(line);
      continue;
    }

    if (code === null) {
      flushProse();
      language = line.trimStart().slice(FENCE.length).trim();
      code = [];
      continue;
    }

    blocks.push({ kind: 'code', language, code: code.join('\n') });
    code = null;
    language = '';
  }

  // Una cerca sin cerrar es un bloque que se está escribiendo, no un error.
  if (code === null) flushProse();
  else blocks.push({ kind: 'code', language, code: code.join('\n') });

  return blocks;
}
