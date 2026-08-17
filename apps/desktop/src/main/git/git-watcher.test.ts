import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GitWatcher } from './git-watcher.js';
import { startGitWatcher } from './git-watcher.js';

/** Holgado: el CI de Windows es lento y chokidar espera a que el archivo cierre. */
const TIMEOUT_MS = 15_000;

async function waitFor(condition: () => boolean, describeFailure: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Se agotó la espera: ${describeFailure}`);

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('startGitWatcher', () => {
  let root: string;
  let watcher: GitWatcher | undefined;
  let notifications: number;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pastecode-gitwatch-'));
    notifications = 0;

    await mkdir(join(root, '.git', 'refs', 'heads'), { recursive: true });
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(root, '.git', 'index'), 'x');

    watcher = startGitWatcher(root, () => {
      notifications += 1;
    });

    // Sin esperar el recorrido inicial, un archivo creado en esa ventana se
    // cuenta como preexistente y `ignoreInitial` se lo traga.
    await watcher.ready;
  });

  afterEach(async () => {
    await watcher?.close();
    watcher = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it(
    'avisa cuando cambia el HEAD, que es lo que mueve un checkout',
    async () => {
      await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/otra\n');

      await waitFor(() => notifications > 0, 'el aviso del HEAD');
      expect(notifications).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'avisa cuando cambia el índice, que es lo que mueve un git add',
    async () => {
      await writeFile(join(root, '.git', 'index'), 'otra cosa');

      await waitFor(() => notifications > 0, 'el aviso del índice');
      expect(notifications).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'avisa cuando aparece una rama nueva adentro de refs',
    async () => {
      await writeFile(join(root, '.git', 'refs', 'heads', 'nueva'), 'abc123\n');

      await waitFor(() => notifications > 0, 'el aviso de la rama nueva');
      expect(notifications).toBeGreaterThan(0);
    },
    TIMEOUT_MS
  );

  it(
    'agrupa una ráfaga en un solo aviso',
    async () => {
      // Un commit toca el índice, el HEAD y una ref casi al mismo tiempo. Sin
      // el debounce serían tres `git status` para contar el mismo hecho.
      await writeFile(join(root, '.git', 'index'), 'a');
      await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/x\n');
      await writeFile(join(root, '.git', 'refs', 'heads', 'x'), 'abc\n');

      await waitFor(() => notifications > 0, 'el aviso de la ráfaga');
      // Se espera un poco más para que, si hubiera avisos de más, lleguen.
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(notifications).toBeLessThanOrEqual(2);
    },
    TIMEOUT_MS
  );

  it(
    'no avisa por los objetos, que son miles en cada operación',
    async () => {
      await mkdir(join(root, '.git', 'objects', 'ab'), { recursive: true });
      await writeFile(join(root, '.git', 'objects', 'ab', 'cdef'), 'contenido');

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(notifications).toBe(0);
    },
    TIMEOUT_MS
  );
});
