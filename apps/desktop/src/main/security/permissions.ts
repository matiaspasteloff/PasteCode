import { isAppOrigin } from './url-origin.js';

/**
 * Los únicos permisos de Chromium que la app concede, y sólo a su propio origen.
 *
 * El portapapeles está porque la acción _Pegar_ del menú contextual de Monaco
 * lee con `navigator.clipboard.readText()`, que pide `clipboard-read`, y
 * _Copiar_ y _Cortar_ escriben con `clipboard-sanitized-write`. El atajo
 * `Ctrl+V` no pasa por acá —es un evento nativo de pegado—, y por eso un E2E
 * que pasa con la lista vacía no probaría que sobra: ninguno abre el menú
 * contextual del editor.
 *
 * Todo lo demás —cámara, micrófono, geolocalización, notificaciones, MIDI,
 * HID, USB, serial— se niega. Un IDE no los usa, y Electron los concede por
 * omisión si nadie instala un handler.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
]);

/**
 * Decide si se concede un permiso de Chromium.
 *
 * Hacen falta las dos condiciones: que el permiso esté en la allow-list **y**
 * que lo pida la app. Un permiso permitido pedido desde otro origen —un
 * `<iframe>` que alguien logró meter, una navegación que se coló— se niega
 * igual.
 *
 * @param permission Nombre del permiso, tal como lo reporta Electron.
 * @param requestingOrigin Origen o URL de quien lo pide. `undefined` se niega.
 * @param appOrigin Origen propio de la app.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @returns `true` si el permiso se concede.
 * @example
 * isPermissionAllowed('clipboard-read', 'pastecode://app/', 'pastecode://app', undefined); // true
 * isPermissionAllowed('geolocation', 'pastecode://app/', 'pastecode://app', undefined);    // false
 */
export function isPermissionAllowed(
  permission: string,
  requestingOrigin: string | undefined,
  appOrigin: string,
  devServerOrigin: string | undefined
): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;

  return isAppOrigin(requestingOrigin, appOrigin, devServerOrigin);
}

/**
 * Lo que `applyPermissionPolicy` necesita de una sesión.
 *
 * `Session` de Electron lo cumple estructuralmente. Pedir la interfaz mínima y
 * no la clase es lo que deja testear el cableado en Node sin levantar una app,
 * igual que `MaximizableWindow` en `main/ipc/window.ts`.
 */
export interface PermissionSession {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (permissionGranted: boolean) => void,
      details: { readonly requestingUrl: string }
    ) => void
  ): void;
  setPermissionCheckHandler(
    handler: (webContents: unknown, permission: string, requestingOrigin: string) => boolean
  ): void;
  setDevicePermissionHandler(handler: () => boolean): void;
}

/**
 * Instala la política de permisos en una sesión: denegar todo lo que no esté
 * en la allow-list, o que no venga de la app.
 *
 * Hacen falta los dos handlers. Chromium primero **chequea** un permiso
 * (`navigator.permissions.query`, y antes de muchas APIs) y recién si el
 * chequeo no alcanza hace el **pedido**: con uno solo instalado, la otra mitad
 * sigue respondiendo con el comportamiento por omisión de Electron, que es
 * conceder. Los dispositivos (HID, USB, serial) tienen un tercer handler, y la
 * respuesta ahí es siempre que no.
 *
 * @param session Sesión de la ventana.
 * @param appOrigin Origen propio de la app.
 * @param devServerOrigin Origen del dev server, o `undefined` en producción.
 * @example
 * applyPermissionPolicy(window.webContents.session, APP_ORIGIN, devServerOrigin);
 */
export function applyPermissionPolicy(
  session: PermissionSession,
  appOrigin: string,
  devServerOrigin: string | undefined
): void {
  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(
      isPermissionAllowed(permission, details.requestingUrl, appOrigin, devServerOrigin)
    );
  });

  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, appOrigin, devServerOrigin)
  );

  session.setDevicePermissionHandler(() => false);
}
