/**
 * Lo que queda después de consumir un chunk: los eventos completos que se
 * pudieron leer, y el resto que todavía no forma uno.
 */
export interface SseParseResult {
  /** Los payloads de las líneas `data:`, en orden. Sin el prefijo. */
  events: string[];
  /** Lo que quedó sin terminar. Se le pasa tal cual al chunk siguiente. */
  rest: string;
  /** Si apareció el centinela `[DONE]` que cierra el stream de OpenAI. */
  isDone: boolean;
}

/**
 * El centinela con el que la API cierra el stream.
 *
 * No es JSON: mandarlo a `JSON.parse` da un error que no significa nada. Se lo
 * reconoce acá y no aguas abajo por eso mismo.
 */
const DONE_SENTINEL = '[DONE]';

/**
 * Consume un trozo de `text/event-stream` y devuelve los eventos completos.
 *
 * **Es puro y es incremental**, que son las dos cosas que lo hacen testeable
 * sin red: entra el resto de la vuelta anterior más lo que acaba de llegar, y
 * sale lo que se pudo leer más lo que todavía no. El caller no guarda estado
 * más allá de pasar el `rest`.
 *
 * El corte por `\n\n` no es cosmético: **un chunk de red casi nunca coincide
 * con un evento**. Un JSON partido a la mitad entre dos chunks es el caso
 * normal, no el raro, y tratar cada chunk como si fuera un evento completo
 * hace que se pierdan tokens al azar según cómo caiga el TCP. Es exactamente
 * el mismo problema que resuelve el `buffered` de `services/search.ts` con las
 * líneas de ripgrep.
 *
 * Las líneas que no empiezan con `data:` se ignoran: el protocolo permite
 * `event:`, `id:`, `retry:` y comentarios con `:`, y OpenRouter manda
 * comentarios de keep-alive cada tanto para que la conexión no se caiga.
 *
 * @param pending El `rest` de la llamada anterior, o `''` la primera vez.
 * @param chunk Lo que acaba de llegar del stream.
 * @returns Los eventos completos, el resto sin consumir, y si llegó `[DONE]`.
 * @example
 * const { events, rest } = consumeSse('', 'data: {"a":1}\n\ndata: {"b":');
 * // events: ['{"a":1}'], rest: 'data: {"b":'
 */
export function consumeSse(pending: string, chunk: string): SseParseResult {
  // `\r\n` normalizado a `\n` antes de partir: el protocolo admite los dos
  // finales de línea, y sin esto un servidor que usa CRLF deja un `\r` colgado
  // al final de cada payload y el `JSON.parse` de aguas abajo falla.
  const buffered = (pending + chunk).replaceAll('\r\n', '\n');
  const blocks = buffered.split('\n\n');

  // El último bloque puede estar incompleto: se lo devuelve como resto. Si el
  // buffer terminaba justo en `\n\n`, `split` deja una cadena vacía ahí, que
  // es el resto correcto para la próxima vuelta.
  const rest = blocks.pop() ?? '';
  const events: string[] = [];
  let isDone = false;

  for (const block of blocks) {
    for (const payload of dataLinesOf(block)) {
      if (payload === DONE_SENTINEL) {
        isDone = true;
        continue;
      }

      events.push(payload);
    }
  }

  return { events, rest, isDone };
}

/**
 * Los payloads `data:` de un bloque, ya sin el prefijo ni el espacio opcional.
 *
 * Un bloque puede tener varias líneas `data:`; el protocolo dice que se
 * concatenan con `\n`. En la práctica OpenRouter manda una sola, pero
 * quedarse con la última en vez de juntarlas es la clase de atajo que rompe
 * con un mensaje multilínea y nadie sabe por qué.
 */
function dataLinesOf(block: string): string[] {
  const payloads: string[] = [];

  for (const line of block.split('\n')) {
    if (!line.startsWith('data:')) continue;

    payloads.push(line.slice('data:'.length).trimStart());
  }

  // Se juntan sólo si hay más de una: el caso normal no paga nada.
  return payloads.length > 1 ? [payloads.join('\n')] : payloads;
}
