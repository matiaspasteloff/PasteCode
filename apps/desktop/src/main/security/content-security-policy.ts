import type { Session } from 'electron';

/**
 * CSP de producción. Es literalmente la de
 * docs/convenciones/seguridad.md#content-security-policy.
 *
 * `style-src 'unsafe-inline'` es la única excepción del proyecto, aceptada
 * porque Monaco inyecta estilos dinámicamente. Está documentada en ADR-0002 y
 * registrada en RNF-13. No se agregan excepciones nuevas sin ADR.
 */
const PRODUCTION_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
};

/**
 * Arma la CSP para el modo en el que corre la app.
 *
 * El dev server de Vite es incompatible con la política de producción: el
 * preámbulo de React Refresh es un script inline, las transformaciones de HMR
 * usan `eval`, y el canal de HMR es un WebSocket que `connect-src 'self'`
 * rechaza. La salida no es relajar la CSP para los dos modos —eso convierte una
 * comodidad de desarrollo en un agujero de producción—, sino que producción
 * conserve la política estricta y el E2E corra sobre el build de producción,
 * que es el que se distribuye.
 *
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @returns El valor del header `Content-Security-Policy`.
 * @example
 * buildContentSecurityPolicy(undefined).includes("'unsafe-eval'"); // false
 */
export function buildContentSecurityPolicy(devServerOrigin: string | undefined): string {
  const directives: Record<string, readonly string[]> = { ...PRODUCTION_DIRECTIVES };

  if (devServerOrigin !== undefined) {
    const webSocketOrigin = devServerOrigin.replace(/^http/, 'ws');
    directives['script-src'] = ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
    directives['connect-src'] = ["'self'", devServerOrigin, webSocketOrigin];
  }

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Emite la CSP como header en cada respuesta de la sesión.
 *
 * Va por header y no por `<meta>` en el HTML para que exista una sola fuente
 * de verdad, en el proceso privilegiado: un `<meta>` vive en el renderer, que
 * es justamente la capa de la que la CSP tiene que defendernos.
 *
 * @param session Sesión de la ventana.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @example
 * applyContentSecurityPolicy(window.webContents.session, undefined);
 */
export function applyContentSecurityPolicy(
  session: Session,
  devServerOrigin: string | undefined
): void {
  const policy = buildContentSecurityPolicy(devServerOrigin);

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}
