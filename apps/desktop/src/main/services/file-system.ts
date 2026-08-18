import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { lstat, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import type { DirectoryEntry } from '@pastecode/core';
import {
  BinaryFileUnsupportedError,
  createExclusionMatcher,
  DEFAULT_EXCLUDES,
  EntryAlreadyExistsError,
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
 * El último matcher compilado, junto a los patrones que lo produjeron.
 *
 * El predicado corre **una vez por entrada de directorio**, así que compilar
 * los globs en cada llamada sería la diferencia entre cumplir
 * [RF-001](../../../../../docs/03-requerimientos-funcionales.md) con 5.000
 * archivos y no cumplirlo. Se memoiza por identidad del array: `resolveSettings`
 * devuelve el mismo array mientras nadie toque `files.exclude`, así que la
 * comparación por referencia alcanza y no hay que recorrer la lista.
 */
let compiled: { patterns: readonly string[]; matches: (relativePath: string) => boolean } = {
  patterns: DEFAULT_EXCLUDES,
  matches: createExclusionMatcher(DEFAULT_EXCLUDES),
};

/** El matcher de un conjunto de patrones, recompilando sólo si cambiaron. */
function exclusionMatcher(patterns: readonly string[]): (relativePath: string) => boolean {
  if (patterns !== compiled.patterns) {
    compiled = { patterns, matches: createExclusionMatcher(patterns) };
  }

  return compiled.matches;
}

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
  workspaceRoot: string,
  excludePatterns: readonly string[] = DEFAULT_EXCLUDES
): Promise<DirectoryEntry[]> {
  const isExcluded = exclusionMatcher(excludePatterns);
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
 * **Una sola lectura, con posición y longitud explícitas.** La alternativa
 * —olfatear los primeros 8KB con `handle.read` y después pedir el resto con
 * `handle.readFile`— hace dos pasadas y deja el resultado atado a dónde quedó
 * la posición del descriptor tras el olfateo, que es una semántica que no
 * conviene tener que recordar. Con `size` sacado del `stat` del mismo
 * descriptor se lee exactamente eso, de una, y el buffer sirve para las dos
 * cosas.
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
    if (size === 0) return { content: '', mtimeMs };

    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);

    if (hasNullByte(buffer)) throw new BinaryFileUnsupportedError(path);

    return { content: buffer.toString('utf8'), mtimeMs };
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
 * Crea un archivo vacío.
 *
 * El modo `wx` es la creación **exclusiva** del sistema operativo: si ya hay
 * algo con ese nombre falla, y falla atómicamente. Preguntar con un `stat` y
 * crear después dejaría una ventana entre las dos llamadas —chica, pero real
 * con un doble click o con otra herramienta tocando la misma carpeta— en la que
 * pisaríamos un archivo existente. RF-003 pide justo lo contrario.
 *
 * No crea los directorios que falten: el árbol siempre crea adentro de una
 * carpeta que ya está a la vista.
 *
 * @param path Ruta absoluta, ya resuelta por `resolveInsideWorkspace`.
 * @returns La entrada nueva, lista para insertar en el árbol.
 * @throws {EntryAlreadyExistsError} Si ya existe.
 * @throws {FileAccessError} Si el sistema operativo rechaza la operación.
 * @example
 * await createEmptyFile('C:\\proyecto\\src\\nuevo.ts');
 */
export async function createEmptyFile(path: string): Promise<DirectoryEntry> {
  const handle = await open(path, 'wx').catch((cause: unknown) => {
    throw toCreationError(path, cause);
  });

  await handle.close();

  return { name: basename(path), path, isDirectory: false };
}

/**
 * Crea un directorio.
 *
 * **Sin `recursive`**, y no es un descuido: con esa opción `mkdir` es
 * idempotente y crear una carpeta que ya existe devolvería éxito en silencio.
 * Acá el `EEXIST` es justamente la respuesta que se quiere.
 *
 * @param path Ruta absoluta, ya resuelta por `resolveInsideWorkspace`.
 * @returns La entrada nueva, lista para insertar en el árbol.
 * @throws {EntryAlreadyExistsError} Si ya existe.
 * @throws {FileAccessError} Si el sistema operativo rechaza la operación.
 * @example
 * await createDirectoryAt('C:\\proyecto\\src\\componentes');
 */
export async function createDirectoryAt(path: string): Promise<DirectoryEntry> {
  await mkdir(path).catch((cause: unknown) => {
    throw toCreationError(path, cause);
  });

  return { name: basename(path), path, isDirectory: true };
}

/**
 * Renombra o mueve una entrada, sin pisar nada.
 *
 * `fs.rename` **sobrescribe el destino en silencio** en las tres plataformas
 * —en Windows es `MoveFileEx` con `MOVEFILE_REPLACE_EXISTING`—, y Node no
 * expone una variante que no lo haga. Así que el chequeo previo no es
 * paranoia: sin él, renombrar `a.ts` a `b.ts` destruye el `b.ts` que había,
 * que es exactamente lo que RF-003 prohíbe.
 *
 * Queda una ventana entre el chequeo y el `rename` en la que otro proceso puede
 * crear el destino. Es la única forma con la API que hay, y el riesgo real es
 * despreciable frente al que evita: acá el que renombra es una persona mirando
 * el árbol, no un lote concurrente.
 *
 * El caso de cambiar sólo mayúsculas se deja pasar a propósito. En Windows y en
 * macOS el filesystem no distingue `Foo.ts` de `foo.ts`, así que el destino
 * "ya existe" siempre que sea el mismo archivo, y sin esta excepción arreglar
 * la capitalización de un nombre sería imposible.
 *
 * @param from Ruta actual, ya resuelta por `resolveInsideWorkspace`.
 * @param to Ruta nueva, ya resuelta por `resolveInsideWorkspace`.
 * @returns La entrada con su nombre y su ruta nuevos.
 * @throws {EntryAlreadyExistsError} Si el destino ya está ocupado por otra entrada.
 * @throws {FileAccessError} Si el sistema operativo rechaza la operación.
 * @example
 * await renameEntry('C:\\p\\viejo.ts', 'C:\\p\\nuevo.ts');
 */
export async function renameEntry(from: string, to: string): Promise<DirectoryEntry> {
  if (!isSameEntry(from, to) && (await entryExists(to))) {
    throw new EntryAlreadyExistsError(to);
  }

  await rename(from, to).catch((cause: unknown) => {
    throw toCreationError(to, cause);
  });

  const info = await stat(to).catch((cause: unknown) => {
    throw new FileAccessError(to, cause);
  });

  return { name: basename(to), path: to, isDirectory: info.isDirectory() };
}

/**
 * Si dos rutas nombran la misma entrada del disco.
 *
 * En Windows y en macOS el filesystem por defecto no distingue mayúsculas, así
 * que la comparación tiene que ser insensible o un cambio de capitalización se
 * leería como "el destino ya existe". En Linux sí distingue, y ahí `Foo.ts` y
 * `foo.ts` son dos archivos distintos de verdad.
 */
function isSameEntry(from: string, to: string): boolean {
  if (process.platform === 'linux') return from === to;

  return from.toLowerCase() === to.toLowerCase();
}

/**
 * Si hay algo en esa ruta.
 *
 * `lstat` y no `stat`: un symlink colgado **ocupa el nombre** igual, y
 * renombrar encima de él lo destruiría.
 */
async function entryExists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  );
}

/**
 * Traduce el `errno` de una creación al error del proyecto que corresponde.
 *
 * `EEXIST` es el único que la persona puede resolver sola, eligiendo otro
 * nombre, así que es el único que se distingue.
 */
function toCreationError(path: string, cause: unknown): Error {
  return errorCode(cause) === 'EEXIST'
    ? new EntryAlreadyExistsError(path, cause)
    : new FileAccessError(path, cause);
}

/** El `code` de un error de Node, si lo que se lanzó tenía uno. */
function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;

  const { code } = cause;

  return typeof code === 'string' ? code : undefined;
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
function hasNullByte(content: Buffer): boolean {
  return content.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/** Traduce el `errno` crudo a un error del proyecto antes de que se propague. */
async function openOrFail(path: string, flags: string): Promise<FileHandle> {
  try {
    return await open(path, flags);
  } catch (cause) {
    throw new FileAccessError(path, cause);
  }
}
