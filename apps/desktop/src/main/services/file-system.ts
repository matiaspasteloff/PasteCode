import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { open, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import type { DirectoryEntry } from '@pastecode/core';
import {
  BinaryFileUnsupportedError,
  createExclusionMatcher,
  DEFAULT_EXCLUDES,
  FileAccessError,
  FileTooLargeError,
  sortEntries,
  StaleFileError,
} from '@pastecode/core';

/**
 * Techo de lo que el editor abre. Por encima de esto Monaco deja de
 * defenderse; [RNF-03](../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * sólo se compromete hasta 10MB, así que 50MB ya es holgado.
 */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Cuánto se olfatea para decidir si un archivo es binario. Es la misma
 * heurística que usa Git: un byte nulo en los primeros 8KB.
 */
const BINARY_SNIFF_BYTES = 8 * 1024;

/** Contenido de un archivo junto al `mtime` con el que se leyó. */
export interface ReadFileResult {
  content: string;
  mtimeMs: number;
}

/**
 * Las exclusiones son una constante y no un setting hasta la Etapa 3. Se
 * compila una sola vez porque el predicado corre una vez por entrada.
 */
const isExcluded = createExclusionMatcher(DEFAULT_EXCLUDES);

/**
 * Lista **un nivel** de un directorio, ya ordenado y ya filtrado.
 *
 * No es recursivo a propósito: el árbol pide los hijos al expandir. Es lo que
 * hace que el criterio de [RF-001](../../../../../docs/03-requerimientos-funcionales.md)
 * —árbol visible en menos de 500ms con 5.000 archivos— se cumpla solo, porque
 * nunca se recorre más de una carpeta por vez.
 *
 * Las entradas que no son ni archivo ni directorio —sockets, FIFOs, y los
 * symlinks colgados, que `withFileTypes` no puede clasificar— se descartan.
 * Mostrar algo que al abrirlo va a fallar es peor que no mostrarlo.
 *
 * @param path Ruta absoluta, ya resuelta por `resolveInsideWorkspace`.
 * @param workspaceRoot Raíz del workspace, para evaluar las exclusiones.
 * @returns Las entradas visibles, carpetas primero y alfabéticas.
 * @throws {FileAccessError} Si el directorio no existe o no se puede leer.
 * @example
 * const entries = await readDirectoryLevel('C:\\p\\src', 'C:\\p');
 */
export async function readDirectoryLevel(
  path: string,
  workspaceRoot: string
): Promise<DirectoryEntry[]> {
  const found = await readdir(path, { withFileTypes: true }).catch((cause: unknown) => {
    throw new FileAccessError(path, cause);
  });

  const entries = found
    .filter((item) => item.isDirectory() || item.isFile())
    .map((item) => ({
      name: item.name,
      path: join(path, item.name),
      isDirectory: item.isDirectory(),
    }))
    // Las exclusiones se evalúan contra la ruta relativa a la raíz, que es lo
    // que los patrones describen: `**/node_modules`, no `C:\p\node_modules`.
    .filter((item) => !isExcluded(relative(workspaceRoot, item.path)));

  return sortEntries(entries);
}

/**
 * Lee un archivo de texto UTF-8.
 *
 * La ruta que recibe ya tiene que estar validada contra el workspace: este
 * servicio no sabe qué workspace hay abierto, y mezclar las dos
 * responsabilidades es la forma de que algún día una llegue sin la otra.
 *
 * El `stat`, el olfateo y la lectura salen del **mismo descriptor**. Con tres
 * llamadas por ruta habría una ventana entre el chequeo de tamaño y la lectura
 * en la que el archivo puede cambiar, y el límite dejaría de ser un límite.
 *
 * @param path Ruta absoluta, ya resuelta por `resolveInsideWorkspace`.
 * @returns El contenido y el `mtimeMs` con el que se leyó.
 * @throws {FileAccessError} Si no se puede abrir.
 * @throws {FileTooLargeError} Si supera los 50MB.
 * @throws {BinaryFileUnsupportedError} Si tiene bytes nulos.
 * @example
 * const { content, mtimeMs } = await readTextFile('C:\\proyecto\\a.ts');
 */
export async function readTextFile(path: string): Promise<ReadFileResult> {
  const handle = await openOrFail(path, 'r');

  try {
    const { size, mtimeMs } = await handle.stat();
    if (size > MAX_FILE_BYTES) throw new FileTooLargeError(path, size, MAX_FILE_BYTES);
    if (await hasNullByte(handle, size)) throw new BinaryFileUnsupportedError(path);

    return { content: await handle.readFile('utf8'), mtimeMs };
  } finally {
    await handle.close();
  }
}

/**
 * Escribe un archivo de forma atómica.
 *
 * Temporal en el **mismo directorio** → `fsync` → `rename`, que es lo que pide
 * [RNF-07](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
 * El temporal va al lado del destino y no en `tmpdir` porque `rename` sólo es
 * atómico dentro del mismo volumen; entre volúmenes es copiar y borrar, que es
 * exactamente lo que estamos evitando. El `fsync` va antes del `rename` para
 * que un corte de luz no deje el nombre bueno apuntando a datos incompletos.
 *
 * @param path Ruta absoluta, ya resuelta por `resolveInsideWorkspace`.
 * @param content Contenido nuevo, UTF-8.
 * @param expectedMtimeMs `mtimeMs` de la última lectura. Omitirlo desactiva la
 *   detección de conflictos, que es lo que hace un "guardar de todas formas".
 * @returns El `mtimeMs` nuevo, para la próxima escritura.
 * @throws {StaleFileError} Si el archivo cambió en disco desde la lectura.
 * @throws {FileAccessError} Si el sistema operativo rechaza la operación.
 * @example
 * const { mtimeMs } = await writeTextFileAtomically(path, 'const x = 1;\n', 1_700_000_000_000);
 */
export async function writeTextFileAtomically(
  path: string,
  content: string,
  expectedMtimeMs?: number
): Promise<{ mtimeMs: number }> {
  if (expectedMtimeMs !== undefined) await assertNotStale(path, expectedMtimeMs);

  // El UUID evita que dos guardados simultáneos del mismo archivo se pisen el
  // temporal; el punto inicial lo esconde de los listados mientras existe.
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);

  try {
    await writeAndFlush(temporary, content);
    await rename(temporary, path);
  } catch (cause) {
    // En Windows el `rename` sobre un archivo abierto por otro proceso falla
    // con EBUSY. Sin esta limpieza, cada intento fallido deja un `.tmp` en la
    // carpeta del usuario.
    await rm(temporary, { force: true });
    throw new FileAccessError(path, cause);
  }

  const { mtimeMs } = await stat(path);
  return { mtimeMs };
}

/**
 * Verifica que el archivo no haya cambiado desde que se leyó.
 *
 * Que no exista **no** es un conflicto: si alguien lo borró por afuera,
 * guardar lo vuelve a crear, que es lo que espera cualquiera que le dio a
 * `Ctrl+S`. El conflicto es que exista y sea otro.
 */
async function assertNotStale(path: string, expectedMtimeMs: number): Promise<void> {
  const current = await stat(path).catch(() => undefined);
  if (current === undefined) return;

  if (current.mtimeMs !== expectedMtimeMs) {
    throw new StaleFileError(path, expectedMtimeMs, current.mtimeMs);
  }
}

/** Escribe el temporal y lo baja a disco antes de que nadie lo renombre. */
async function writeAndFlush(temporary: string, content: string): Promise<void> {
  // 'wx' falla si el temporal ya existe. Con un UUID en el nombre eso sería un
  // bug, y preferimos que se note acá y no sobrescribiendo algo.
  const handle = await open(temporary, 'wx');

  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** La heurística de Git: un byte nulo en los primeros 8KB y es binario. */
async function hasNullByte(handle: FileHandle, size: number): Promise<boolean> {
  const length = Math.min(size, BINARY_SNIFF_BYTES);
  if (length === 0) return false;

  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, 0);

  return buffer.subarray(0, bytesRead).includes(0);
}

/** Traduce el `errno` crudo a un error del proyecto antes de que se propague. */
async function openOrFail(path: string, flags: string): Promise<FileHandle> {
  try {
    return await open(path, flags);
  } catch (cause) {
    throw new FileAccessError(path, cause);
  }
}
