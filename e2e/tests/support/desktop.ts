import { readFileSync } from 'node:fs';
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
