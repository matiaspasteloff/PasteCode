import { homedir } from 'node:os';
import { join } from 'node:path';

import { app } from 'electron';

/** Dónde viven las extensiones del usuario. Se reemplaza en el E2E. */
let userDirectory = defaultUserDirectory();

/** `~/.pastecode/extensions/` ([RF-901](../../../../../docs/03-requerimientos-funcionales.md)). */
function defaultUserDirectory(): string {
  return join(homedir(), '.pastecode', 'extensions');
}

/**
 * Apunta las extensiones del usuario a otro directorio.
 *
 * Existe para el E2E por la misma razón que `useBackupDirectory`: una suite que
 * le instala extensiones en el `~/.pastecode/` de quien la corre es peor que no
 * tener suite.
 *
 * @param path Directorio de extensiones del usuario.
 * @example
 * useExtensionsDirectory(join(dataDirectory, 'extensions'));
 */
export function useExtensionsDirectory(path: string): void {
  userDirectory = path;
}

/**
 * Los directorios donde se buscan extensiones, en orden de precedencia.
 *
 * **El orden importa: lo último gana.** Primero las empaquetadas y después las
 * del usuario, así que una extensión propia con el mismo `name` pisa a la que
 * vino con el IDE. Es lo que permite probar una versión modificada sin
 * desinstalar nada.
 *
 * Las empaquetadas salen de `resources/extensions/` y **no** de adentro del
 * asar: el host las carga con un `import()` dinámico, y `import()` no sabe leer
 * de un asar —ésa es la diferencia con `utilityProcess.fork`, que sí
 * ([ADR-0027](../../../../../docs/adr/0027-empaquetado-y-fork-del-extension-host.md))—.
 * En desarrollo salen del `extensions/` del repositorio, que es la misma
 * carpeta sin empaquetar.
 *
 * @returns Las rutas a escanear.
 * @example
 * const dirs = extensionDirectories();
 */
export function extensionDirectories(): string[] {
  return [bundledDirectory(), userDirectory];
}

/** Las que vinieron con el IDE. */
function bundledDirectory(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'extensions');

  // `out/main/` → la raíz del repositorio. En desarrollo las extensiones son
  // las del monorepo, sin copiar.
  return join(__dirname, '..', '..', '..', '..', 'extensions');
}
