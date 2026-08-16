import { accessSync, constants } from 'node:fs';
import { isAbsolute } from 'node:path';

/**
 * Verifica que una ruta sea un ejecutable que existe y se puede correr.
 *
 * Sale de `resolveShell`, que lo hacía en línea: desde la Etapa 4 son **tres**
 * los consumidores —el shell de la terminal, los servidores de lenguaje y
 * `git`—, y CLAUDE.md pide buscar el servicio que ya hace algo similar antes de
 * escribir uno nuevo. Tenerlo en un lugar también significa que la regla se
 * arregla en un lugar.
 *
 * **La ruta tiene que ser absoluta.** Un nombre suelto se rechaza en vez de
 * buscarse en el `PATH`: dejar que el sistema operativo elija el primero que
 * encuentre es lo que convierte una settings en "ejecutá lo que haya", y el
 * `PATH` de un proyecto lo puede escribir un repositorio clonado. Ver
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md#procesos-hijo-y-binarios-externos).
 *
 * Devuelve un motivo en vez de lanzar porque cada consumidor tiene su propia
 * clase de error con su propio `userMessage`: el shell lanza
 * `TerminalSpawnError`, el LSP marca el servidor como fallado y sigue andando,
 * y Git simplemente desaparece de la UI. Un error común los obligaría a
 * traducirlo, que es más código que este `switch`.
 *
 * @param candidate Ruta a verificar.
 * @returns `null` si sirve, o por qué no sirve.
 * @example
 * assertExecutable('C:\\Program Files\\Git\\cmd\\git.exe'); // null
 * assertExecutable('git');                                  // 'not-absolute'
 */
export function assertExecutable(candidate: string): 'not-absolute' | 'not-executable' | null {
  if (!isAbsolute(candidate)) return 'not-absolute';

  try {
    // `X_OK` en Windows no verifica el bit de ejecución —no existe— pero sí que
    // el archivo esté y sea accesible, que es la mitad que importa acá.
    accessSync(candidate, constants.X_OK);
  } catch {
    return 'not-executable';
  }

  return null;
}
