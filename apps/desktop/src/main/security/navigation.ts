/**
 * Decide si el renderer tiene permitido navegar a una URL.
 *
 * Es la contracara de que el renderer no sea de confianza: si una extensión
 * comprometida o un XSS logran disparar una navegación, esto es lo que impide
 * que la ventana del IDE termine mostrando una página remota con el preload
 * ya inyectado.
 *
 * En producción sólo `file://`. En desarrollo se agrega el origen del dev
 * server, que es la única concesión que necesita el HMR de Vite.
 *
 * @param rawUrl URL destino, tal como la reporta `will-navigate`.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @returns `true` si la navegación es aceptable.
 * @example
 * isAllowedNavigation('file:///c:/app/index.html', undefined);        // true
 * isAllowedNavigation('https://evil.test', undefined);               // false
 * isAllowedNavigation('http://localhost:5173/', 'http://localhost:5173'); // true
 */
export function isAllowedNavigation(
  rawUrl: string,
  devServerOrigin: string | undefined
): boolean {
  const url = parseUrl(rawUrl);
  if (url === undefined) return false;

  if (url.protocol === 'file:') return true;

  return devServerOrigin !== undefined && url.origin === devServerOrigin;
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
