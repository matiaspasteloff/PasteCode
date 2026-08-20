import { realpathSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Crea un directorio temporal y devuelve su ruta **larga**.
 *
 * El `realpathSync.native` no es cosmético: es lo que evita que el proceso de
 * test se muera de golpe en Windows.
 *
 * `os.tmpdir()` sale de `TEMP`, y en el CI de Windows esa variable viene en
 * formato 8.3 —el usuario del runner es `runneradmin`, más de ocho caracteres,
 * así que el perfil es `C:\Users\RUNNER~1\...`—. Cuando a un watcher se le pasa
 * una ruta corta, libuv resuelve la larga por su cuenta para comparar contra lo
 * que reporta `ReadDirectoryChangesW`, la comparación no da, y libuv **aborta el
 * proceso** con `Assertion failed: !_wcsnicmp(filename, dir, dirlen)`. No es una
 * excepción que se pueda atrapar: el worker de vitest desaparece y sus tests no
 * reportan nunca.
 *
 * Localmente no se ve, porque un nombre de usuario de ocho caracteres o menos no
 * tiene alias 8.3 y `TEMP` ya viene largo.
 *
 * Tiene que ser `realpathSync.native` y no el `realpath` de `node:fs/promises`:
 * la implementación en JS resuelve symlinks pero deja `PROGRA~1` tal cual, que
 * es justo la mitad que acá importa. `node:fs/promises` no expone la variante
 * nativa, de ahí la versión sincrónica.
 *
 * @param prefix Prefijo del nombre, para reconocer de quién es el directorio.
 * @returns Ruta absoluta y larga del directorio recién creado.
 * @example
 * const root = await makeTempDirectory('pastecode-watch-');
 */
export async function makeTempDirectory(prefix: string): Promise<string> {
  return realpathSync.native(await mkdtemp(join(tmpdir(), prefix)));
}

/**
 * Borra un directorio temporal, con reintentos.
 *
 * **Los reintentos no son cosmética.** `rm` de Node no reintenta por omisión
 * —`maxRetries` vale 0—, y en Windows borrar un directorio que todavía tiene un
 * handle abierto falla con `EBUSY: resource busy or locked, rmdir`. El handle
 * llega de dos lados: el `cwd` de un proceso hijo que ya recibió su señal pero
 * todavía no salió —en Windows el directorio de trabajo de un proceso vivo está
 * bloqueado—, y el indexador del sistema pasando por ahí.
 *
 * Era un flaky real: aparecía en una de cada tres corridas completas de la
 * suite, en archivos distintos, siempre con la misma firma. Que apareciera en
 * `workspace.test.ts` y en `pty.test.ts` —que no comparten nada salvo un
 * `afterEach` que borra un temporal— es lo que delató que la causa no era del
 * test sino de la limpieza.
 *
 * @param path Directorio a borrar. No falla si no existe.
 * @example
 * afterEach(() => removeTempDirectory(sandbox));
 */
export async function removeTempDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
