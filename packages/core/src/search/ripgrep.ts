/** Un match, tal como lo ve la UI. Coordenadas base 1, convención LSP. */
export interface SearchMatch {
  /** Ruta absoluta del archivo. */
  path: string;
  line: number;
  column: number;
  /** La línea entera, sin el salto. Es el contexto que pide RF-202. */
  preview: string;
  /** Largo del texto que coincidió, para resaltarlo. */
  matchLength: number;
}

/** Lo que la UI pide buscar. */
export interface SearchQuery {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  matchWholeWord: boolean;
  /** Globs de inclusión ([RF-203](../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)). */
  includeGlobs: readonly string[];
  /** Globs de exclusión. Salen de `files.exclude` de las settings. */
  excludeGlobs: readonly string[];
}

/**
 * Arma los argumentos de ripgrep.
 *
 * **Devuelve un array y nunca una línea de comando**, y ésa es la decisión de
 * seguridad de esta función: un array llega al sistema operativo como `argv`,
 * sin pasar por ningún intérprete, así que una consulta con comillas, espacios
 * o `&&` es una consulta y no un comando nuevo. Ver
 * [seguridad.md](../../../../docs/convenciones/seguridad.md#argumentos-como-array-nunca-como-línea-de-comando).
 *
 * El patrón va detrás de `-e` por la misma razón: sin eso, buscar `-i` haría
 * que ripgrep lo leyera como una bandera.
 *
 * Es puro para poder testear exactamente qué se le pasa al proceso. Es el
 * único lugar donde un error se traduce en ejecutar algo distinto de lo que se
 * pidió, así que conviene que sea el lugar más testeado.
 *
 * @param search Lo que se busca y con qué filtros.
 * @param root Raíz del workspace. Es el último argumento, como pide ripgrep.
 * @returns Los argumentos, en orden.
 * @example
 * buildRipgrepArgs({ query: 'foo', ... }, 'C:\\p'); // ['--json', ..., '-e', 'foo', 'C:\\p']
 */
export function buildRipgrepArgs(search: SearchQuery, root: string): string[] {
  const args = [
    // Una línea de JSON por evento. Es lo que hace que se puedan mostrar
    // resultados mientras el proceso sigue buscando, que es lo que RF-201
    // necesita para cumplir su presupuesto de un segundo.
    '--json',
    // Sin color: las secuencias ANSI ensuciarían el texto del preview.
    '--color',
    'never',
  ];

  if (!search.isRegex) args.push('--fixed-strings');
  args.push(search.isCaseSensitive ? '--case-sensitive' : '--ignore-case');
  if (search.matchWholeWord) args.push('--word-regexp');

  for (const glob of search.includeGlobs) args.push('--glob', glob);
  // El `!` es la sintaxis de negación de ripgrep. Se agrega acá y no se pide
  // en la lista para que `files.exclude` se escriba igual que en las settings.
  for (const glob of search.excludeGlobs) args.push('--glob', `!${glob}`);

  args.push('-e', search.query, root);

  return args;
}

/**
 * Traduce una línea de la salida `--json` de ripgrep a un match.
 *
 * Devuelve `undefined` para todo lo que no sea un match —los eventos `begin`,
 * `end` y `summary`, y cualquier línea que no parsee—. Que una línea rota se
 * ignore en vez de tumbar la búsqueda es deliberado: ripgrep escribe en un
 * stream y un chunk puede partirse en cualquier lado, así que quien llama
 * arma las líneas y acá se descarta lo que no sirva.
 *
 * **Sólo se toma el primer submatch de cada línea.** Una línea con tres
 * ocurrencias produce un resultado, no tres: el panel muestra líneas, y tres
 * entradas idénticas con distinta columna es ruido.
 *
 * @param line Una línea de la salida de ripgrep.
 * @returns El match, o `undefined`.
 * @example
 * parseRipgrepLine('{"type":"match","data":{...}}');
 */
export function parseRipgrepLine(line: string): SearchMatch | undefined {
  if (line === '') return undefined;

  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!isMatchEvent(parsed)) return undefined;

  const { data } = parsed;
  const submatch = data.submatches[0];

  if (submatch === undefined) return undefined;

  return {
    path: data.path.text,
    line: data.line_number,
    // ripgrep da desplazamientos en bytes base 0; la UI trabaja en base 1.
    column: submatch.start + 1,
    // El salto final es de ripgrep, no del contenido de la línea.
    preview: data.lines.text.replace(/\r?\n$/, ''),
    matchLength: submatch.end - submatch.start,
  };
}

/** La forma del evento `match` de ripgrep, verificada campo por campo. */
interface RipgrepMatchEvent {
  type: 'match';
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: { start: number; end: number }[];
  };
}

/**
 * Verifica la forma del evento sin aserciones.
 *
 * Es un contrato con un binario externo que se actualiza por su cuenta, así
 * que se comprueba de verdad: si una versión futura de ripgrep cambia la
 * forma, el resultado es que no aparecen matches, no que la app rompa con un
 * `undefined` tres capas más arriba.
 */
function isMatchEvent(value: unknown): value is RipgrepMatchEvent {
  if (!isObject(value)) return false;
  if (!('type' in value) || value.type !== 'match') return false;
  if (!('data' in value) || !isObject(value.data)) return false;

  return isMatchData(value.data);
}

/** La forma del campo `data` de un evento `match`. */
function isMatchData(data: object): boolean {
  return (
    hasText(data, 'path') &&
    hasText(data, 'lines') &&
    isNumber(data, 'line_number') &&
    'submatches' in data &&
    Array.isArray(data.submatches) &&
    data.submatches.every(isSubmatch)
  );
}

/** Si el valor es un objeto que no es `null`. */
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** Si `data[key]` es un número. */
function isNumber(data: object, key: string): boolean {
  return key in data && typeof Reflect.get(data, key) === 'number';
}

/** Si `data[key]` es un `{ text: string }`. */
function hasText(data: object, key: 'path' | 'lines'): boolean {
  const field: unknown = key in data ? Reflect.get(data, key) : undefined;

  return isObject(field) && 'text' in field && typeof field.text === 'string';
}

/** Si el valor es un submatch con desplazamientos numéricos. */
function isSubmatch(value: unknown): value is { start: number; end: number } {
  return isObject(value) && isNumber(value, 'start') && isNumber(value, 'end');
}
