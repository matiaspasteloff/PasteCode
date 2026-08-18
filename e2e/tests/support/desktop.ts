import { existsSync, readFileSync } from 'node:fs';
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
