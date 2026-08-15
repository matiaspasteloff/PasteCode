/**
 * Decide si el renderer tiene permitido navegar a una URL.
 *
 * Es la contracara de que el renderer no sea de confianza: si una extensión
 * comprometida o un XSS logran disparar una navegación, esto es lo que impide
 * que la ventana del IDE termine mostrando una página remota con el preload
 * ya inyectado.
 *
 * En producción sólo el origen propio de la app. En desarrollo se agrega el
 * origen del dev server, que es la única concesión que necesita el HMR de Vite.
 *
 * **`file://` ya no está permitido.** Desde ADR-0012 el renderer se sirve por
 * un esquema propio, así que una navegación a `file://` dejó de ser el caso
 * normal y pasó a ser exactamente lo que hay que bloquear: es la forma de que
 * un link a `file:///c:/...` abra un HTML del disco con el preload inyectado.
 *
 * @param rawUrl URL destino, tal como la reporta `will-navigate`.
 * @param appOrigin Origen propio de la app.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @returns `true` si la navegación es aceptable.
 * @example
 * isAllowedNavigation('pastecode://app/index.html', 'pastecode://app', undefined); // true
 * isAllowedNavigation('file:///c:/app/index.html', 'pastecode://app', undefined);  // false
 * isAllowedNavigation('https://evil.test', 'pastecode://app', undefined);          // false
 */
export function isAllowedNavigation(
  rawUrl: string,
  appOrigin: string,
  devServerOrigin: string | undefined
): boolean {
  const url = parseUrl(rawUrl);
  if (url === undefined) return false;

  const origin = originOf(url);
  if (origin === appOrigin) return true;

  return devServerOrigin !== undefined && origin === devServerOrigin;
}

/**
 * El origen de una URL, calculado a mano y no leído de `url.origin`.
 *
 * `URL.origin` devuelve la cadena `'null'` para todo esquema que no sea uno de
 * los especiales del estándar, y `pastecode:` no lo es. En Chromium sí tiene
 * origen real, porque lo registramos como `standard` (ADR-0012), pero el
 * `URL` de Node no se entera de eso: acá el origen propio de la app daría
 * `'null'`, igual que `file://`, y la allow-list dejaría pasar las dos cosas.
 */
function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

/**
 * Decide si una URL puede abrirse en el navegador del sistema.
 *
 * Sólo `https:`. `shell.openExternal` no se limita a abrir páginas web: con
 * `file:` abre archivos locales y con un protocolo custom lanza cualquier
 * aplicación que lo tenga registrado en el sistema. Una allow-list de
 * protocolos es lo que separa "abrir un link" de "ejecutar algo".
 *
 * @param rawUrl URL que el renderer intenta abrir.
 * @returns `true` si es seguro pasársela a `shell.openExternal`.
 * @example
 * isSafeExternalUrl('https://github.com/matiaspasteloff/PasteCode'); // true
 * isSafeExternalUrl('file:///c:/windows/system32/calc.exe');         // false
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  return parseUrl(rawUrl)?.protocol === 'https:';
}

function parseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl);
  } catch {
    // Una URL que no parsea no es una URL permitida. No hay caso ambiguo acá.
    return undefined;
  }
}
