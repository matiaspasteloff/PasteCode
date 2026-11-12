/**
 * Parsea una URL sin lanzar.
 *
 * Una URL que no parsea no es una URL permitida, en ninguna de las políticas
 * que la usan: no hay caso ambiguo, así que alcanza con `undefined`.
 *
 * @param rawUrl Texto a parsear.
 * @returns La URL, o `undefined` si no es una URL válida.
 * @example
 * parseUrl('https://example.com')?.protocol; // 'https:'
 * parseUrl('no es una url');                 // undefined
 */
export function parseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

/**
 * El origen de una URL, calculado a mano y no leído de `url.origin`.
 *
 * `URL.origin` devuelve la cadena `'null'` para todo esquema que no sea uno de
 * los especiales del estándar, y `pastecode:` no lo es. En Chromium sí tiene
 * origen real, porque lo registramos como `standard` (ADR-0012), pero el
 * `URL` de Node no se entera de eso: acá el origen propio de la app daría
 * `'null'`, igual que `file://`, y cualquier allow-list por origen dejaría
 * pasar las dos cosas.
 *
 * @param rawUrl URL completa, o un origen suelto (con o sin `/` final).
 * @returns El origen como `esquema://host[:puerto]`, o `undefined` si no parsea.
 * @example
 * originOf('pastecode://app/index.html'); // 'pastecode://app'
 * originOf('http://localhost:5173/');     // 'http://localhost:5173'
 */
function originOf(rawUrl: string): string | undefined {
  const url = parseUrl(rawUrl);

  return url === undefined ? undefined : `${url.protocol}//${url.host}`;
}

/**
 * Decide si una URL pertenece a la app: su origen propio, o el del dev server
 * cuando se corre en desarrollo.
 *
 * Es la regla que comparten la navegación y los permisos. Existe en un solo
 * lugar a propósito: dos copias de "qué es la app" terminan diciendo cosas
 * distintas, y la diferencia es un agujero.
 *
 * @param rawUrl URL u origen a evaluar. `undefined` nunca es de la app.
 * @param appOrigin Origen propio de la app.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @returns `true` si el origen es el de la app.
 * @example
 * isAppOrigin('pastecode://app/index.html', 'pastecode://app', undefined); // true
 * isAppOrigin('https://evil.test', 'pastecode://app', undefined);          // false
 */
export function isAppOrigin(
  rawUrl: string | undefined,
  appOrigin: string,
  devServerOrigin: string | undefined
): boolean {
  if (rawUrl === undefined) return false;

  const origin = originOf(rawUrl);
  if (origin === undefined) return false;
  if (origin === appOrigin) return true;

  return devServerOrigin !== undefined && origin === devServerOrigin;
}
