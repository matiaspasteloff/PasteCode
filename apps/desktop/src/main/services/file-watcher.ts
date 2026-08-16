import { relative, sep } from 'node:path';

import { createExclusionMatcher } from '@pastecode/core';
import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';

/**
 * Cuánto se acumula antes de avisar, en milisegundos.
 *
 * Es la **segunda** capa de debounce y resuelve un problema distinto de la
 * primera: `awaitWriteFinish` espera a que *un* archivo deje de crecer; esto
 * junta *muchos* archivos. Un `git checkout` toca miles en una ráfaga, y
 * mandarlos de a uno son miles de saltos de proceso y miles de renders.
 */
const COALESCE_MS = 100;

/**
 * Más de esto en una descarga y se avisa "revalidá todo" en vez de la lista.
 *
 * Procesar diez mil entradas en el hilo de UI rompe el presupuesto de 50ms de
 * [RNF-06](../../../../../docs/04-requerimientos-no-funcionales.md#performance),
 * y a esa escala la lista tampoco sirve para nada: nadie va a mirar cuál de los
 * diez mil archivos cambió.
 */
const BULK_THRESHOLD = 500;

/** Cuánto se recuerda una escritura propia antes de olvidarla. */
const OWN_WRITE_TTL_MS = 5000;

/** Qué le pasó a un archivo. Los tres casos que el renderer distingue. */
type FileChangeKind = 'created' | 'modified' | 'deleted';

interface FileChange {
  readonly path: string;
  readonly kind: FileChangeKind;
}

/** Lo que el watcher informa en cada descarga. */
export interface FileChangeBatch {
  readonly changes: readonly FileChange[];
  /**
   * Si hubo tantos cambios que no vale la pena listarlos.
   *
   * Con esto en `true`, `changes` viene vacío a propósito y quien escucha
   * revalida en bloque.
   */
  readonly isBulk: boolean;
}

/** Un watcher vivo sobre la raíz de un workspace. */
export interface FileWatcher {
  /**
   * Anota que **nosotros** acabamos de escribir ese archivo.
   *
   * **No es opcional y es lo que muerde en la semana dos.** `fs:writeFile`
   * dispara el watcher, que emitiría un cambio para el archivo que la persona
   * acaba de guardar: el renderer lo releería y, si la pestaña quedó sucia por
   * una tecla escrita entre medio, mostraría un diálogo de conflicto contra un
   * cambio que hicimos nosotros mismos.
   */
  noteOwnWrite: (path: string) => void;
  close: () => Promise<void>;
}

export interface FileWatcherConfig {
  readonly root: string;
  /** Los mismos patrones de `files.exclude` que filtran el árbol y la búsqueda. */
  readonly excludeGlobs: readonly string[];
  readonly onChanges: (batch: FileChangeBatch) => void;
}

/**
 * Vigila la raíz del workspace y avisa qué cambió, en lotes.
 *
 * **chokidar y no `fs.watch({ recursive: true })`**, y la decisión no es de
 * gusto de API sino de exclusiones: el `fs.watch` recursivo ya funciona en las
 * tres plataformas, pero no filtra, así que vigila `node_modules` —miles de
 * handles en Windows y un chorro de eventos que se tiran—. Filtrar después no
 * sirve: el costo está en establecer los watches. chokidar v4 toma `ignored`
 * como **función**, y `createExclusionMatcher` ya está construido para
 * `files.exclude`, así que RF-005 aplica al watcher gratis y con semántica
 * idéntica a la del árbol y la búsqueda.
 * Ver [ADR-0020](../../../../../docs/adr/0020-watcher-unico-con-chokidar.md).
 *
 * Contrapunto honesto: `services/settings.ts` usa `node:fs.watch` crudo para
 * dos rutas fijas y **se queda así**. Dos archivos conocidos no necesitan una
 * librería; un árbol recursivo con lista de exclusiones sí.
 *
 * @param config Raíz, exclusiones y a quién avisarle.
 * @returns El watcher, ya andando.
 * @example
 * const watcher = startFileWatcher({ root, excludeGlobs, onChanges: broadcast });
 */
export function startFileWatcher(config: FileWatcherConfig): FileWatcher {
  const isExcluded = createExclusionMatcher(config.excludeGlobs);
  /** Ruta → `mtime` del momento en que la escribimos nosotros. */
  const ownWrites = new Map<string, number>();
  const pending = new Map<string, FileChangeKind>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;

    const changes = [...pending.entries()].map(([path, kind]) => ({ path, kind }));
    pending.clear();

    if (changes.length === 0) return;

    const isBulk = changes.length > BULK_THRESHOLD;

    config.onChanges({ changes: isBulk ? [] : changes, isBulk });
  }

  function record(path: string, kind: FileChangeKind): void {
    if (consumeOwnWrite(ownWrites, path)) return;

    // La última noticia gana: si un archivo se creó y se modificó en la misma
    // ráfaga, lo que el renderer necesita saber es que ahora existe y cambió.
    pending.set(path, kind);
    timer ??= setTimeout(flush, COALESCE_MS);
  }

  const watcher = watch(config.root, {
    // `ignoreInitial` es lo que hace que abrir una carpeta no emita un evento
    // por archivo existente. Sin esto, abrir este repositorio serían miles de
    // eventos antes de pintar nada.
    ignoreInitial: true,
    ignored: (candidate) => shouldIgnore(config.root, candidate, isExcluded),
    // Un guardado atómico es un `rename` más cambios de tamaño: la misma ráfaga
    // que `settings.ts` ya pelea a mano. Esto espera a que el archivo deje de
    // crecer antes de contarlo como un cambio.
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
  });

  watcher.on('add', (path) => {
    record(path, 'created');
  });
  watcher.on('change', (path) => {
    record(path, 'modified');
  });
  watcher.on('unlink', (path) => {
    record(path, 'deleted');
  });
  // Un watcher que muere en silencio es peor que uno que no existe: la app
  // seguiría creyendo que el disco no cambió.
  watcher.on('error', (cause) => {
    console.error(JSON.stringify({ scope: 'watcher', event: 'failed' }), cause);
  });

  return {
    noteOwnWrite(path) {
      ownWrites.set(path, Date.now());
    },

    async close() {
      if (timer !== null) clearTimeout(timer);
      await closeWatcher(watcher);
    },
  };
}

/**
 * Si una ruta no se vigila.
 *
 * La raíz nunca se ignora: ignorarla apagaría el watcher entero. Lo de adentro
 * se consulta contra el matcher de exclusiones, con rutas relativas y `/` como
 * separador, que es el contrato de `createExclusionMatcher`.
 */
function shouldIgnore(
  root: string,
  candidate: string,
  isExcluded: (relativePath: string) => boolean
): boolean {
  const relativePath = relative(root, candidate);

  if (relativePath === '') return false;

  return isExcluded(relativePath.split(sep).join('/'));
}

/**
 * Consume la marca de una escritura propia, si la hay y sigue fresca.
 *
 * El TTL existe porque la marca se pone antes de escribir y el evento puede no
 * llegar nunca —si el contenido no cambió, algunos filesystems no emiten nada—.
 * Sin vencimiento, esa marca huérfana se tragaría el **próximo** cambio externo
 * de ese archivo, que es un bug mucho peor que el que estamos evitando.
 */
function consumeOwnWrite(ownWrites: Map<string, number>, path: string): boolean {
  const notedAt = ownWrites.get(path);

  if (notedAt === undefined) return false;

  ownWrites.delete(path);

  return Date.now() - notedAt < OWN_WRITE_TTL_MS;
}

/** Cierra el watcher sin dejar que un error de cierre tumbe el apagado. */
async function closeWatcher(watcher: FSWatcher): Promise<void> {
  try {
    await watcher.close();
  } catch (cause) {
    console.error(JSON.stringify({ scope: 'watcher', event: 'close-failed' }), cause);
  }
}
