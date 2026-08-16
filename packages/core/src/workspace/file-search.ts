import { fuzzyMatch } from '../commands/fuzzy.js';

/** Un archivo del índice de quick open. */
export interface IndexedFile {
  /** Ruta absoluta. Es lo que se abre. */
  path: string;
  /** Ruta relativa a la raíz, con `/`. Es lo que se muestra y lo que se matchea. */
  relativePath: string;
}

/**
 * Cuánto vale coincidir en el nombre del archivo en lugar de en la carpeta.
 *
 * Es lo único que quick open agrega sobre el matcher de la paleta, y es lo que
 * separa una lista útil de una inservible: buscar `index` en un proyecto
 * cualquiera coincide con `src/index.ts` y también con `packages/index-utils/
 * cache.ts`. Sin el premio, las dos salen con puntajes parecidos y el archivo
 * que uno quería queda enterrado.
 *
 * El número es holgado a propósito: cualquier coincidencia en el nombre le
 * tiene que ganar a cualquier coincidencia que sólo esté en la carpeta.
 */
const NAME_BONUS = 100;

/**
 * Ordena los archivos del índice por qué tan bien coinciden con lo tipeado.
 *
 * Reusa `fuzzyMatch`, que ya está escrito y testeado para la paleta de
 * comandos ([RF-701](../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración)).
 * Lo único propio de [RF-205](../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * es el premio por coincidir en el nombre.
 *
 * El `limit` no es una optimización cosmética: el índice de un repositorio
 * grande son decenas de miles de entradas, y el presupuesto de RF-205 son
 * **50ms para los primeros resultados**. Cortar la lista antes de devolverla
 * evita que el renderer construya una vista de veinte mil filas que nadie va a
 * mirar más allá de las primeras diez.
 *
 * @param query Lo que se tipeó. Vacío devuelve los primeros `limit`, en orden.
 * @param files El índice.
 * @param limit Cuántos devolver como máximo.
 * @returns Los mejores, del mejor al peor.
 * @example
 * rankFiles('idx', index, 50);
 */
export function rankFiles(
  query: string,
  files: readonly IndexedFile[],
  limit: number
): IndexedFile[] {
  if (query === '') return files.slice(0, limit);

  return files
    .map((file, index) => ({ file, index, score: scoreFile(query, file) }))
    .filter((entry) => entry.score !== undefined)
    .sort((left, right) => {
      const byScore = (right.score ?? 0) - (left.score ?? 0);

      // El desempate por posición original mantiene el orden estable: dos
      // archivos igual de buenos salen siempre en el mismo orden.
      return byScore !== 0 ? byScore : left.index - right.index;
    })
    .slice(0, limit)
    .map((entry) => entry.file);
}

/**
 * El puntaje de un archivo, o `undefined` si no coincide.
 *
 * Se prueba primero contra el nombre y después contra la ruta entera. No es
 * sólo por el premio: un archivo puede coincidir por la ruta sin coincidir por
 * el nombre —tipear `src/a` para llegar a `src/api.ts`— y ése también tiene
 * que aparecer.
 */
function scoreFile(query: string, file: IndexedFile): number | undefined {
  const byName = fuzzyMatch(query, fileName(file.relativePath));

  if (byName !== undefined) return byName.score + NAME_BONUS;

  return fuzzyMatch(query, file.relativePath)?.score;
}

/**
 * El último segmento de una ruta relativa.
 *
 * Se parte a mano y no con `basename` porque `packages/core` no puede importar
 * `node:path`: cambia de semántica según la plataforma, y el mismo caso daría
 * distinto en el runner de Linux del CI.
 */
function fileName(relativePath: string): string {
  const cut = relativePath.lastIndexOf('/');

  return cut === -1 ? relativePath : relativePath.slice(cut + 1);
}
