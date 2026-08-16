import { getActiveEditor, getLoadedMonaco } from './monaco-instance.js';
import { rememberRestorePosition, takeRestorePosition } from './restore-position.js';

/**
 * Lleva el cursor a una posición de un archivo, esté abierto o no.
 *
 * Es lo que hace que "click en un resultado abre el archivo en esa línea"
 * ([RF-202](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace))
 * funcione en los dos casos que existen, que no son el mismo:
 *
 * - **El archivo no está a la vista.** La posición se anota y la aplica el
 *   editor cuando monte el modelo, que es el mismo camino que usa la
 *   restauración de sesión.
 * - **El archivo ya es la pestaña activa.** Ahí el editor no vuelve a montar
 *   nada, así que si sólo se anotara la posición no pasaría nada: clickear un
 *   segundo resultado del mismo archivo no movería el cursor.
 *
 * @param path Ruta absoluta del archivo.
 * @param line Línea, base 1.
 * @param column Columna, base 1.
 * @example
 * revealPosition('C:\\p\\a.ts', 42, 7);
 */
export function revealPosition(path: string, line: number, column: number): void {
  rememberRestorePosition(path, { line, column, scrollTopLine: line });

  const editor = getActiveEditor();
  const monaco = getLoadedMonaco();
  if (editor === null || monaco === null) return;

  if (editor.getModel()?.uri.toString() !== monaco.Uri.file(path).toString()) return;

  // Ya está a la vista: se consume lo recién anotado para que no vuelva a
  // aplicarse la próxima vez que se muestre este modelo.
  takeRestorePosition(path);
  editor.setPosition({ lineNumber: line, column });
  editor.revealLineNearTop(line);
  editor.focus();
}
