/**
 * Cómo se instaló la app, en lo que importa para actualizarla.
 *
 * - `nsis`: el instalador de un click de Windows.
 * - `portable`: el `.exe` portable de Windows, que no se instala.
 * - `appimage`: el AppImage de Linux.
 * - `deb`: el paquete de Debian, que actualiza el gestor de paquetes.
 * - `dmg`: la app de macOS.
 * - `unpackaged`: desarrollo o el E2E, corriendo desde `out/`.
 */
export type InstallKind = 'nsis' | 'portable' | 'appimage' | 'deb' | 'dmg' | 'unpackaged';

/** Lo que hace falta saber de la instalación. */
export interface InstallContext {
  readonly platform: 'win32' | 'darwin' | 'linux';
  readonly arch: string;
  readonly kind: InstallKind;
}

/**
 * Si esta instalación se puede actualizar desde adentro de la app.
 *
 * Es `true` sólo para dos casos, y cada `false` tiene su motivo (ADR-0034):
 *
 * - **Windows x64 instalado con NSIS**: el `latest.yml` que se publica es el
 *   de x64.
 * - **AppImage**: electron-updater reemplaza el archivo.
 * - macOS no: Squirrel.Mac exige una app firmada con certificado, y la nuestra
 *   lleva firma ad-hoc.
 * - Windows arm64 no: en el release hay lugar para un `latest.yml` y es el de
 *   x64, así que esa variante sólo avisa.
 * - El portable no: no hay instalación que actualizar.
 * - `deb` no: lo actualiza el gestor de paquetes, y hacerlo desde la app pediría
 *   `sudo`.
 * - Sin empaquetar no: no hay nada instalado.
 *
 * Cuando es `false`, la app igual avisa y ofrece abrir la página del release.
 *
 * @param context Sistema, arquitectura y forma de instalación.
 * @returns Si se puede descargar e instalar desde la app.
 * @example
 * canInstallInApp({ platform: 'win32', arch: 'x64', kind: 'nsis' }); // true
 * canInstallInApp({ platform: 'darwin', arch: 'arm64', kind: 'dmg' }); // false
 */
export function canInstallInApp(context: InstallContext): boolean {
  if (context.platform === 'win32') return context.kind === 'nsis' && context.arch === 'x64';
  if (context.platform === 'linux') return context.kind === 'appimage';
  return false;
}
