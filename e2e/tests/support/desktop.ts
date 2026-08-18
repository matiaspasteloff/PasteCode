import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz de `apps/desktop`. Es lo que se le pasa a `electron.launch`. */
export const DESKTOP_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'apps',
  'desktop'
);

/**
 * El `.exe` empaquetado, o `undefined` si todavía no se corrió `pnpm package`.
 *
 * Existe para los tests que **tienen que** correr contra el build de verdad y
 * no contra `out/`: dentro del `.asar` las rutas se resuelven distinto, y ése
 * es justamente el riesgo que el spike S1 mide. Devolver `undefined` en vez de
 * lanzar deja que esos tests se salteen solos: `pnpm test:e2e` corre sobre
 * `out/` y no tiene por qué exigir dos minutos de empaquetado antes.
 */
export const PACKAGED_APP: string | undefined = packagedApp();

function packagedApp(): string | undefined {
  const candidate = join(DESKTOP_ROOT, 'release', 'win-unpacked', 'PasteCode.exe');

  return existsSync(candidate) ? candidate : undefined;
}

/**
 * Crea un directorio temporal y devuelve su ruta **larga**.
 *
 * Es el mismo helper que `apps/desktop/src/main/test-support/temp-directory.ts`
 * y está duplicado a propósito: `e2e` es otro paquete y no depende de
 * `apps/desktop`, así que importarlo de allá sería inventar una dependencia
 * entre paquetes para compartir cuatro líneas.
 *
 * El `realpathSync.native` no es cosmético. `os.tmpdir()` sale de `TEMP`, y en
 * el CI de Windows esa variable viene en formato 8.3 —el usuario del runner es
 * `runneradmin`, más de ocho caracteres, así que el perfil queda como
 * `RUNNER~1`—. Cuando a un watcher se le pasa una ruta corta, libuv resuelve la
 * larga por su cuenta para comparar contra lo que reporta el sistema, la
 * comparación no da, y el watcher **no avisa nunca**. La app usa `fs.watch`
 * sobre `~/.pastecode` para la recarga en caliente de settings y de
 * keybindings, así que cualquier test que apunte `PASTECODE_E2E_HOME` a un
 * temporal y espere un cambio en caliente necesita la ruta larga.
 *
 * Tiene que ser `realpathSync.native`: la implementación en JS de
 * `node:fs/promises` resuelve symlinks pero deja el nombre corto tal cual.
 *
 * @param prefix Prefijo del nombre, para reconocer de quién es el directorio.
 * @returns Ruta absoluta y larga del directorio recién creado.
 * @example
 * const home = await makeTempDirectory('pastecode-keys-home-');
 */
export async function makeTempDirectory(prefix: string): Promise<string> {
  return realpathSync.native(await mkdtemp(join(tmpdir(), prefix)));
}

/**
 * Lee la versión del `package.json` de la app sin aserciones de tipo: el
 * contenido de un archivo es `unknown` hasta que alguien lo verifique.
 *
 * @returns La versión declarada por `apps/desktop`.
 * @example
 * await expect(window.getByTestId('app-version')).toHaveText(readDesktopVersion());
 */
export function readDesktopVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(join(DESKTOP_ROOT, 'package.json'), 'utf8'));

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
  ) {
    return parsed.version;
  }

  throw new Error('apps/desktop/package.json no tiene un campo "version" de tipo string');
}
