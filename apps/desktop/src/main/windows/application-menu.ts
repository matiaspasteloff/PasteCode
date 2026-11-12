import type { MenuItemConstructorOptions } from 'electron';
import { Menu } from 'electron';

/**
 * Qué menú de aplicación lleva la app.
 *
 * - `electron-default`: no se toca nada; queda el de Electron.
 * - `none`: sin menú.
 * - `mac-minimal`: el mínimo de macOS, armado por roles.
 */
export type ApplicationMenuKind = 'electron-default' | 'none' | 'mac-minimal';

/**
 * El menú mínimo de macOS. Sólo roles: los arma Electron, con sus
 * aceleradores y sus textos localizados, sin una línea nuestra que mantener.
 *
 * `editMenu` no es opcional: en macOS los atajos de copiar, cortar, pegar y
 * deshacer los resuelve el menú, y sin él `Cmd+C` deja de andar en todos los
 * campos de texto. `appMenu` trae _Salir_ (`Cmd+Q`) y `windowMenu` minimizar.
 * No hay `viewMenu`: es el que trae recargar y DevTools.
 */
const MAC_MINIMAL_TEMPLATE: readonly MenuItemConstructorOptions[] = [
  { role: 'appMenu' },
  { role: 'editMenu' },
  { role: 'windowMenu' },
];

/**
 * Decide qué menú de aplicación corresponde.
 *
 * El menú por omisión de Electron trae recargar, forzar recarga y abrir
 * DevTools, con sus aceleradores **activos aunque la ventana no tenga marco**
 * y el menú no se vea. En desarrollo es justo lo que se quiere; en la app
 * distribuida es un `Ctrl+Shift+I` a las DevTools al alcance de cualquiera, y
 * un `Ctrl+R` que tira lo que no está guardado.
 *
 * En Windows y Linux la barra de títulos la dibuja el renderer (ADR-0030) y
 * los atajos los resuelve la app, así que no hace falta ningún menú. En macOS
 * sí: ver `MAC_MINIMAL_TEMPLATE`.
 *
 * @param platform `process.platform`.
 * @param isDevelopment Si la app corre contra el dev server.
 * @returns Qué menú instalar.
 * @example
 * chooseApplicationMenu('win32', false);  // 'none'
 * chooseApplicationMenu('darwin', false); // 'mac-minimal'
 * chooseApplicationMenu('linux', true);   // 'electron-default'
 */
export function chooseApplicationMenu(
  platform: NodeJS.Platform,
  isDevelopment: boolean
): ApplicationMenuKind {
  if (isDevelopment) return 'electron-default';

  return platform === 'darwin' ? 'mac-minimal' : 'none';
}

/**
 * Instala el menú de aplicación que corresponda.
 *
 * **Se llama dentro de `whenReady` y antes de crear la ventana**: `Menu` no
 * se puede usar antes de que la app esté lista, y si la ventana se crea antes
 * hereda un instante el menú por omisión.
 *
 * @param platform `process.platform`.
 * @param isDevelopment Si la app corre contra el dev server.
 * @example
 * applyApplicationMenu(process.platform, isDevelopment);
 */
export function applyApplicationMenu(platform: NodeJS.Platform, isDevelopment: boolean): void {
  const kind = chooseApplicationMenu(platform, isDevelopment);

  if (kind === 'none') Menu.setApplicationMenu(null);
  else if (kind === 'mac-minimal') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([...MAC_MINIMAL_TEMPLATE]));
  }
}
