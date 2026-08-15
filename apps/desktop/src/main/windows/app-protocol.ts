import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isInsideRoot } from '@pastecode/core';
import { net, protocol } from 'electron';

/**
 * Esquema propio desde el que se sirve el renderer en producción.
 *
 * No es cosmética: bajo `file://` el origen es opaco, y con un origen opaco
 * Chromium se niega a construir web workers y `default-src 'self'` no
 * referencia nada. Monaco necesita las dos cosas. Ver
 * [ADR-0012](../../../../../docs/adr/0012-servir-el-renderer-desde-un-protocolo-propio.md).
 */
const SCHEME = 'pastecode';

/** Host del esquema. Con `standard: true` la URL necesita uno. */
const HOST = 'app';

/** Origen completo. Es lo que significan `'self'` en la CSP y la allow-list. */
export const APP_ORIGIN = `${SCHEME}://${HOST}`;

/**
 * Declara el esquema como estándar y seguro.
 *
 * **Tiene que llamarse antes de `app.whenReady()`.** Electron lo exige, y si
 * se llama tarde el esquema queda registrado pero sin privilegios: la página
 * carga, y los workers y la CSP siguen sin funcionar. Falla en silencio, que
 * es la peor forma de fallar.
 *
 * - `standard` le da un origen de verdad, que es todo el punto.
 * - `secure` lo pone en la lista de contextos seguros, sin la cual no hay
 *   workers de módulo ni `crypto.subtle`.
 * - `supportFetchAPI` habilita `fetch` desde el renderer hacia el propio
 *   bundle, que es como Vite carga los chunks dinámicos.
 *
 * @example
 * registerAppScheme(); // arriba de todo en main/index.ts
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/**
 * Sirve el bundle del renderer desde el esquema propio.
 *
 * @param rendererRoot Carpeta con el `index.html` y los assets construidos.
 * @example
 * serveRendererFrom(join(__dirname, '../renderer'));
 */
export function serveRendererFrom(rendererRoot: string): void {
  protocol.handle(SCHEME, async (request) => {
    const target = resolveRequestedFile(rendererRoot, request.url);

    // Un `..` en la URL ya lo colapsa el parser por ser un esquema estándar,
    // pero la contención se verifica igual: esto sirve archivos del disco a
    // pedido del renderer, y el renderer no es de confianza.
    if (target === undefined) return new Response('Forbidden', { status: 403 });

    return net.fetch(pathToFileURL(target).toString());
  });
}

/** La ruta en disco del archivo pedido, o `undefined` si escapa del bundle. */
function resolveRequestedFile(rendererRoot: string, requestUrl: string): string | undefined {
  const { pathname } = new URL(requestUrl);
  const relative = decodeURIComponent(pathname);
  const target = join(rendererRoot, relative === '/' ? '/index.html' : relative);

  return isInsideRoot(rendererRoot, target) ? target : undefined;
}
