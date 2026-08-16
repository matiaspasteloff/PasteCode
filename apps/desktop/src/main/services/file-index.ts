import { relative } from 'node:path';

import type { IndexedFile } from '@pastecode/core';

import { readDirectoryLevel } from './file-system.js';

/**
 * Techo de archivos indexados.
 *
 * El índice viaja entero por IPC una vez al abrir el workspace, y a partir de
 * ahí el matching de [RF-205](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * corre en el renderer sin volver a cruzar el proceso: es lo que hace posible
 * el presupuesto de 50ms por tecla. El precio es que el índice tiene que
 * caber en un mensaje, y veinte mil entradas ya son unos dos megabytes.
 *
 * Un repositorio más grande que esto queda con el índice truncado, no roto:
 * quick open sigue funcionando sobre lo que entró.
 */
export const MAX_INDEXED_FILES = 20_000;

/**
 * Construye el índice de archivos del workspace.
 *
 * Recorre por niveles con `readDirectoryLevel`, que es el mismo lector que usa
 * el árbol y el que ya aplica las exclusiones. Reusarlo no es sólo ahorro de
 * código: garantiza que quick open y el árbol vean exactamente los mismos
 * archivos, que es lo que alguien espera y lo que dos recorridos distintos
 * dejarían de cumplir en cuanto uno de los dos cambie.
 *
 * El recorrido es **por anchura**. Con un tope, eso importa: si se cortara en
 * medio de un recorrido en profundidad, lo que entraría son todos los archivos
 * de la primera rama y ninguno del resto. Por anchura, lo que entra son los
 * niveles de arriba —donde está casi todo lo que alguien abre— de todo el
 * árbol.
 *
 * @param root Raíz del workspace.
 * @param excludePatterns `files.exclude` de las settings.
 * @returns Los archivos, con su ruta relativa lista para mostrar.
 * @example
 * const files = await buildFileIndex('C:\\p', ['**\/node_modules']);
 */
export async function buildFileIndex(
  root: string,
  excludePatterns: readonly string[]
): Promise<IndexedFile[]> {
  const files: IndexedFile[] = [];
  let pending = [root];

  while (pending.length > 0 && files.length < MAX_INDEXED_FILES) {
    const level = pending;
    pending = [];

    // Los directorios de un nivel se leen en paralelo: son llamadas al disco
    // independientes, y encadenarlas multiplica la latencia por la cantidad
    // de carpetas.
    const listings = await Promise.all(
      level.map(async (directory) =>
        readDirectoryLevel(directory, root, excludePatterns).catch(() => [])
      )
    );

    for (const entries of listings) {
      for (const entry of entries) {
        if (entry.isDirectory) {
          pending.push(entry.path);
          continue;
        }

        if (files.length >= MAX_INDEXED_FILES) break;

        files.push({
          path: entry.path,
          // Con `/` siempre: es lo que se muestra y lo que se matchea, y el
          // separador no puede depender de en qué sistema corre.
          relativePath: relative(root, entry.path).replaceAll('\\', '/'),
        });
      }
    }
  }

  return files;
}
