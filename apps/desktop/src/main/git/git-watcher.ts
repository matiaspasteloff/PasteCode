import { join } from 'node:path';

import type { FSWatcher } from 'chokidar';
import { watch } from 'chokidar';

/**
 * Cuánto se espera antes de avisar, en milisegundos.
 *
 * Un `git commit` toca `.git/index`, `.git/HEAD` y varias refs en la misma
 * fracción de segundo. Sin esto serían cuatro `git status` seguidos para
 * contar el mismo hecho.
 */
const COALESCE_MS = 150;

/** Un watcher vivo sobre el `.git` de un workspace. */
export interface GitWatcher {
  /**
   * Se resuelve cuando el recorrido inicial terminó.
   *
   * Hace falta porque `ignoreInitial` **se traga lo que aparezca durante ese
   * recorrido**: un archivo creado en la ventana entre el `watch()` y el
   * `ready` se cuenta como preexistente y no emite nada. En producción esa
   * ventana son milisegundos sobre tres rutas, pero es real, y es lo que hace
   * que un test que crea una rama justo después de arrancar sea determinista.
   */
  ready: Promise<void>;
  close: () => Promise<void>;
}

/**
 * Vigila las tres cosas del `.git` que cambian el estado visible.
 *
 * Es un **segundo scope, angosto y aparte** del watcher del workspace, y tiene
 * que serlo: `files.exclude` trae la carpeta `.git` excluida por defecto, así
 * que el watcher general no ve nada de acá. Sin este scope, Git no se enteraría
 * nunca de un commit, un checkout o un `git add` hechos desde la terminal
 * integrada — que es exactamente el caso que la gente prueba primero.
 *
 * Se vigilan tres rutas y no el `.git` entero a propósito: adentro hay objetos
 * —miles de archivos que se escriben en cada operación— y vigilarlos sería
 * miles de handles para responder a lo mismo que ya cuentan `HEAD`, `index` y
 * `refs`.
 *
 * @param root Raíz del workspace. El `.git` se busca adentro.
 * @param onChange Se llama, ya con debounce, cuando algo cambió.
 * @returns El watcher, ya andando.
 * @example
 * const watcher = startGitWatcher(root, () => { void refresh(); });
 */
export function startGitWatcher(root: string, onChange: () => void): GitWatcher {
  const gitDirectory = join(root, '.git');
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(
    [join(gitDirectory, 'HEAD'), join(gitDirectory, 'index'), join(gitDirectory, 'refs')],
    {
      ignoreInitial: true,
      // Sin esto, `git add` de un archivo grande dispara varias veces mientras
      // el índice se reescribe.
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 },
    }
  );

  const schedule = (): void => {
    if (timer !== null) return;

    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, COALESCE_MS);
  };

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', schedule);
  watcher.on('error', (cause) => {
    console.error(JSON.stringify({ scope: 'git-watcher', event: 'failed' }), cause);
  });

  return {
    ready: new Promise<void>((resolve) => {
      watcher.on('ready', () => {
        resolve();
      });
    }),

    async close() {
      if (timer !== null) clearTimeout(timer);
      await closeWatcher(watcher);
    },
  };
}

/** Cierra el watcher sin dejar que un error de cierre tumbe el apagado. */
async function closeWatcher(watcher: FSWatcher): Promise<void> {
  try {
    await watcher.close();
  } catch (cause) {
    console.error(JSON.stringify({ scope: 'git-watcher', event: 'close-failed' }), cause);
  }
}
