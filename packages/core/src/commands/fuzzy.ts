/** Un candidato con su puntaje y qué posiciones del texto coincidieron. */
export interface FuzzyMatch {
  score: number;
  /** Índices de `text` que coincidieron, para resaltarlos en la UI. */
  positions: readonly number[];
}

/** Premio por coincidir dos caracteres seguidos. Es la señal más fuerte. */
const CONSECUTIVE_BONUS = 8;

/** Premio por coincidir en el arranque de una palabra: `fs` en `file.save`. */
const WORD_START_BONUS = 6;

/** Premio por coincidir el primer carácter del texto. */
const PREFIX_BONUS = 4;

/** Castigo por cada carácter salteado. Favorece las coincidencias compactas. */
const GAP_PENALTY = 1;

/** Lo que separa palabras en un id de comando o un título. */
const WORD_SEPARATORS = new Set([' ', '.', '-', '_', ':', '/']);

/**
 * Busca `query` dentro de `text` en orden, sin exigir que sea contiguo.
 *
 * Es el matcher de la paleta de comandos ([RF-701](../../../../docs/03-requerimientos-funcionales.md)).
 * Son unas setenta líneas de código propio en lugar de una dependencia porque
 * el algoritmo entra en una función, se testea entero y no cambia nunca; una
 * librería de fuzzy matching traería opciones de resaltado, normalización y
 * ordenamiento que no vamos a usar.
 *
 * La comparación ignora mayúsculas y acentos: quien tipea `guardar` en la
 * paleta no debería tener que acordarse de si el título llevaba tilde.
 *
 * @param query Lo que se tipeó. Vacío coincide con todo, con puntaje 0.
 * @param text Texto del candidato.
 * @returns El puntaje y las posiciones, o `undefined` si no coincide.
 * @example
 * fuzzyMatch('fs', 'file.save');   // coincide, con premio por inicio de palabra
 * fuzzyMatch('zz', 'file.save');   // undefined
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | undefined {
  if (query === '') return { score: 0, positions: [] };

  const needle = fold(query);
  const haystack = fold(text);
  const positions: number[] = [];
  let score = 0;
  let cursor = 0;

  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found === -1) return undefined;

    score += scoreAt(haystack, found, positions.at(-1));
    positions.push(found);
    cursor = found + 1;
  }

  return { score, positions };
}

/**
 * Filtra y ordena candidatos por qué tan bien coinciden.
 *
 * El desempate es por la posición original y no alfabético: dos comandos
 * igual de buenos tienen que salir siempre en el mismo orden, y el que
 * registró primero es tan buen criterio como cualquiera y no cambia de una
 * corrida a la otra.
 *
 * @param query Lo que se tipeó.
 * @param candidates Los candidatos.
 * @param toText Cómo sacar el texto a comparar de cada candidato.
 * @returns Los que coinciden, del mejor al peor.
 * @example
 * rankByFuzzyMatch('sav', commands, (command) => command.id);
 */
export function rankByFuzzyMatch<T>(
  query: string,
  candidates: readonly T[],
  toText: (candidate: T) => string
): T[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      match: fuzzyMatch(query, toText(candidate)),
    }))
    .filter((entry) => entry.match !== undefined)
    .sort((left, right) => {
      const byScore = (right.match?.score ?? 0) - (left.match?.score ?? 0);

      return byScore !== 0 ? byScore : left.index - right.index;
    })
    .map((entry) => entry.candidate);
}

/** Cuánto vale coincidir en esta posición, dada la coincidencia anterior. */
function scoreAt(haystack: string, at: number, previous: number | undefined): number {
  if (at === 0) return PREFIX_BONUS + CONSECUTIVE_BONUS;
  if (previous !== undefined && at === previous + 1) return CONSECUTIVE_BONUS;

  const isWordStart = WORD_SEPARATORS.has(haystack[at - 1] ?? '');
  const gap = previous === undefined ? at : at - previous - 1;

  return (isWordStart ? WORD_START_BONUS : 0) - gap * GAP_PENALTY;
}

/**
 * Minúsculas y sin acentos.
 *
 * `NFD` separa la letra de su tilde y el rango de bloque las borra, así que
 * `Añadir` y `anadir` comparan igual.
 */
function fold(value: string): string {
  // `NFD` separa la letra de su marca diacrítica, y `\p{Mn}` —marcas que no
  // ocupan espacio propio— es exactamente lo que hay que borrar después. Se
  // escribe con la propiedad Unicode y no con un rango de caracteres literales
  // porque esos caracteres son invisibles en el editor: cualquiera los borra
  // sin darse cuenta y nadie ve el diff.
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}
