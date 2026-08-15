import { parseAbsolutePath } from './absolute-path.js';

/**
 * Nombre para mostrar de un workspace, a partir de su ruta raíz.
 *
 * Vive en `packages/core` y no en el renderer por una razón concreta: sacar el
 * último segmento de una ruta es `basename`, y el renderer tiene prohibido
 * `node:path` igual que todo el resto de Node. Vive en core y no en el main
 * porque no toca el disco.
 *
 * `basename` tampoco serviría tal cual: para `C:\` devuelve `''` en Windows y
 * `'C:\'` en Linux, así que el título de la ventana dependería de dónde corre.
 *
 * @param root Ruta absoluta de la raíz del workspace.
 * @returns El último segmento, o la ruta entera si no hay ninguno.
 * @example
 * workspaceDisplayName('C:\\proyectos\\PasteCode'); // 'PasteCode'
 * workspaceDisplayName('C:\\');                     // 'C:\'
 */
export function workspaceDisplayName(root: string): string {
  const parsed = parseAbsolutePath(root);

  // Sin segmentos la raíz *es* el volumen (`C:\`, `\\servidor\recurso`, `/`).
  // Mostrar la ruta entera es más útil que mostrar un nombre vacío.
  return parsed?.segments.at(-1) ?? root;
}
