import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

let app: ElectronApplication | undefined;
let workspace: string;
let home: string;
let file: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-recovery-ws-'));
  home = await mkdtemp(join(tmpdir(), 'pastecode-recovery-home-'));
  file = join(workspace, 'uno.ts');

  await writeFile(file, 'const uno = 1;\n', 'utf8');
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

/** Lanza la app con el `~/.pastecode` apuntando al temporal del test. */
async function launch(): Promise<Awaited<ReturnType<ElectronApplication['firstWindow']>>> {
  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: {
      ...process.env,
      PASTECODE_E2E_WORKSPACE: workspace,
      PASTECODE_E2E_HOME: home,
    },
  });

  return app.firstWindow();
}

/**
 * Deja un respaldo escrito a mano, como si la app hubiera muerto con cambios.
 *
 * Se fabrica en vez de esperar los 30 segundos de RNF-08: un E2E que tarda
 * medio minuto por caso no lo corre nadie, y lo que este test verifica es la
 * **recuperación**, no el reloj. Que el intervalo escriba está cubierto por el
 * test del servicio.
 *
 * El nombre es el `sha256` de la ruta, igual que en `services/backups.ts`.
 *
 * Al archivo se le fija además un `mtime` **anterior** al respaldo, que es el
 * escenario de verdad: se guardó, se siguió escribiendo, y la app murió. Sin
 * fijarlo, el archivo recién creado por el `beforeEach` y el respaldo caen en
 * el mismo milisegundo —el `mtime` de Windows es grueso— y el servicio no puede
 * distinguir cuál es más nuevo.
 */
async function plantBackup(content: string, savedAt = Date.now()): Promise<void> {
  const directory = join(home, 'backups');

  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${createHash('sha256').update(file).digest('hex')}.json`),
    JSON.stringify({ path: file, content, savedAt }),
    'utf8'
  );
  await utimes(file, new Date(savedAt - 60_000), new Date(savedAt - 60_000));
}

/** RNF-08: al reabrir después de un cierre con cambios, se **ofrece** restaurar. */
test('RNF-08: se ofrece recuperar lo que quedó sin guardar', async () => {
  await plantBackup('const uno = 1;\nlo que no llegué a guardar\n');

  const window = await launch();

  await expect(window.getByTestId('recovery-dialog')).toBeVisible();
  await expect(window.getByTestId('recovery-list')).toContainText('uno.ts');
});

/** El caso de siempre: un arranque normal no muestra ningún diálogo. */
test('RNF-08: sin nada que recuperar no aparece ningún diálogo', async () => {
  const window = await launch();

  await expect(window.getByTestId('recovery-dialog')).toBeHidden();
});

/**
 * Recuperar deja el contenido en el editor y la pestaña **sucia**.
 *
 * Sucia es la mitad que importa: lo que se muestra no es lo que hay en el
 * disco, y una pestaña limpia diría que ya está guardado.
 */
test('RNF-08: recuperar trae el contenido y lo deja sin guardar', async () => {
  await plantBackup('const uno = 1;\nlo que no llegué a guardar\n');

  const window = await launch();
  await window.getByTestId('recovery-restore').click();

  await expect(window.locator('.monaco-editor')).toContainText('lo que no llegué a guardar');
  await expect(window.getByTestId('recovery-dialog')).toBeHidden();

  // El disco sigue con lo suyo hasta que alguien guarde: recuperar no escribe.
  expect(await readFile(file, 'utf8')).toBe('const uno = 1;\n');
});

/** Descartar no restaura nada y no vuelve a preguntar en el próximo arranque. */
test('RNF-08: descartar deja el archivo del disco y no vuelve a ofrecer', async () => {
  await plantBackup('const uno = 1;\nesto se descarta\n');

  const window = await launch();
  await window.getByTestId('recovery-dismiss').click();
  await expect(window.getByTestId('recovery-dialog')).toBeHidden();

  await app?.close();
  app = undefined;

  // Sin borrar los respaldos, el mismo diálogo volvería para siempre.
  const second = await launch();

  await expect(second.getByTestId('recovery-dialog')).toBeHidden();
});

/**
 * Un respaldo más viejo que el archivo no se ofrece.
 *
 * Es el caso de alguien que guardó y después cerró bien: el contenido bueno es
 * el del disco, y proponer pisarlo con una versión vieja sería el peor
 * comportamiento posible para una función que existe para no perder trabajo.
 */
test('RNF-08: no se ofrece un respaldo anterior al último guardado', async () => {
  const savedAt = Date.now() - 120_000;

  await plantBackup('una versión vieja', savedAt);
  // Y después alguien guardó: el archivo queda más nuevo que el respaldo.
  await utimes(file, new Date(), new Date());

  const window = await launch();

  await expect(window.getByTestId('recovery-dialog')).toBeHidden();
});
