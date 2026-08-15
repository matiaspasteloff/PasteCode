import { realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { FileAccessError, isInsideRoot, PathOutsideWorkspaceError } from '@pastecode/core';

/**
 * Resuelve una ruta recibida por IPC y verifica que caiga dentro del
 * workspace. **Toda ruta que cruce el límite de IPC pasa por acá**, sin
 * excepciones ([RNF-11](../../../../../docs/04-requerimientos-no-funcionales.md)).
 *
 * Es la mitad con I/O de la validación: resuelve los symlinks y delega la
 * decisión de contención en `isInsideRoot`, que es puro y vive en
 * `packages/core`. La partición no es ceremonia — `packages/core` tiene
 * prohibido `node:fs` por ESLint, y de paso deja los casos raros de Windows
 * (mayúsculas, otra unidad, UNC, `..`) cubiertos por tests unitarios sin un
 * solo mock.
 *
 * @param candidate Ruta absoluta pedida por el renderer.
 * @param workspaceRoot Raíz del workspace abierto.
 * @returns La ruta real, con symlinks ya resueltos. Es la que hay que usar.
 * @throws {PathOutsideWorkspaceError} Si la ruta escapa del workspace.
 * @throws {FileAccessError} Si no se puede resolver ni la raíz del volumen.
 * @example
 * const safe = await resolveInsideWorkspace(payload.path, root);
 * const content = await readFile(safe, 'utf8');
 */
export async function resolveInsideWorkspace(
  candidate: string,
  workspaceRoot: string
): Promise<string> {
  const realRoot = await resolveDeepestReal(workspaceRoot);
  const real = await resolveDeepestReal(resolve(realRoot, candidate));

  if (!isInsideRoot(realRoot, real)) throw new PathOutsideWorkspaceError(candidate);

  return real;
}

/**
 * `realpath` del ancestro más profundo que exista, con el resto de los
 * segmentos pegados atrás.
 *
 * La versión de docs/convenciones/seguridad.md hace
 * `realpath(resolved).catch(() => resolved)`, y ese fallback es un agujero:
 * al guardar un archivo que todavía no existe, `realpath` falla con ENOENT y
 * la ruta vuelve **sin resolver**. Con un `workspace\link → C:\Windows`
 * bastaba pedir `workspace\link\nuevo.txt` para escribir fuera del workspace,
 * porque la ruta léxica parece estar adentro.
 *
 * Subiendo hasta el primer ancestro real, el symlink se resuelve igual: el
 * ancestro `workspace\link` sí existe, y de ahí sale `C:\Windows`, que
 * `isInsideRoot` rechaza.
 */
async function resolveDeepestReal(target: string): Promise<string> {
  const pending: string[] = [];
  let current = target;

  for (;;) {
    try {
      const real = await realpath(current);
      return pending.length === 0 ? real : join(real, ...pending);
    } catch (cause) {
      const parent = dirname(current);
      // Llegamos a la raíz del volumen y ni ésa existe: no hay ancestro real
      // del que colgar, y seguir subiendo es un bucle infinito.
      if (parent === current) throw new FileAccessError(target, cause);

      pending.unshift(basename(current));
      current = parent;
    }
  }
}
