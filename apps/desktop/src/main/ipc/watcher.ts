import { BrowserWindow } from 'electron';

import type { FileWatcher } from '../services/file-watcher.js';
import { startFileWatcher } from '../services/file-watcher.js';
import { currentSettings } from '../services/settings.js';
import { registerDisposer } from '../services/shutdown.js';

import { emit } from './emitter.js';

/** El watcher del workspace abierto. Hay uno o ninguno. */
let watcher: FileWatcher | undefined;

/**
 * Arranca el watcher del workspace, cerrando el del anterior.
 *
 * Se llama desde `workspace:open` y **después del primer paint**, no en el
 * camino crítico: chokidar recorre el árbol para establecer los watches, y
 * [RNF-01](../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * pide arrancar en menos de 1,5s. Nada de lo que este watcher produce hace
 * falta en el primer segundo.
 *
 * Un solo callback abanica a todos los que necesitan saber que el disco cambió.
 * Hoy es el renderer (RF-004); cuando existan, el LSP —para
 * `didChangeWatchedFiles`— y Git —para refrescar el estado— cuelgan del mismo
 * lugar, que es la mitad del argumento de
 * [ADR-0020](../../../../../docs/adr/0020-watcher-unico-con-chokidar.md).
 *
 * @param root Raíz del workspace recién abierto.
 * @example
 * startWatchingWorkspace('C:\\proyecto');
 */
export function startWatchingWorkspace(root: string): void {
  void stopWatchingWorkspace();

  watcher = startFileWatcher({
    root,
    // RF-005: la misma clave que filtra el árbol y la búsqueda.
    excludeGlobs: currentSettings().files.exclude,
    onChanges: (batch) => {
      for (const window of BrowserWindow.getAllWindows()) {
        emit(window, 'files:changed', { changes: [...batch.changes], isBulk: batch.isBulk });
      }
    },
  });
}

/** Cierra el watcher, si hay alguno. */
async function stopWatchingWorkspace(): Promise<void> {
  const dying = watcher;

  watcher = undefined;
  await dying?.close();
}

/**
 * Anota que la escritura de ese archivo es nuestra.
 *
 * La llama `fs:writeFile` **antes** de escribir. Sin esto, guardar dispara el
 * watcher y el renderer recarga el archivo que la persona acaba de guardar, o
 * peor, le muestra un diálogo de conflicto contra un cambio propio.
 *
 * @param path Ruta absoluta que se está por escribir.
 * @example
 * noteOwnWrite(path);
 */
export function noteOwnWrite(path: string): void {
  watcher?.noteOwnWrite(path);
}

/**
 * Registra el cierre del watcher en el apagado de la app.
 *
 * @example
 * registerWatcherDisposer(); // antes de app.whenReady()
 */
export function registerWatcherDisposer(): void {
  registerDisposer('watcher', () => stopWatchingWorkspace());
}
