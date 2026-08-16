/** Dónde estaba el cursor y el scroll de un archivo en la sesión anterior. */
export interface RestorablePosition {
  line: number;
  column: number;
  scrollTopLine: number;
}

/**
 * Posiciones pendientes de aplicar, por ruta.
 *
 * Existe porque restaurar una sesión ([RF-707](../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración))
 * y montar un modelo de Monaco ocurren en momentos distintos: la sesión llega
 * del main apenas se abre el workspace, y el modelo recién existe cuando el
 * archivo terminó de leerse. Guardar la intención en el medio es lo que evita
 * tener que coordinar los dos.
 *
 * Se guarda la posición y no un `ICodeEditorViewState` de Monaco a propósito:
 * ese objeto es una estructura interna suya, sin contrato de estabilidad, y
 * escribirlo en un archivo que sobrevive a las actualizaciones sería atarnos a
 * la versión de Monaco que lo produjo. Línea y columna no cambian nunca.
 */
const pending = new Map<string, RestorablePosition>();

/**
 * Anota dónde tiene que quedar el cursor cuando el archivo se abra.
 *
 * @param path Ruta absoluta del archivo.
 * @param position Lo que decía la sesión guardada.
 * @example
 * rememberRestorePosition(path, { line: 42, column: 1, scrollTopLine: 30 });
 */
export function rememberRestorePosition(path: string, position: RestorablePosition): void {
  pending.set(path, position);
}

/**
 * Consume la posición pendiente de un archivo, si la hay.
 *
 * **Se consume, no se consulta**: la restauración pasa una sola vez. Si
 * quedara, volver a esa pestaña más tarde tiraría al cursor de vuelta a donde
 * estaba al abrir la app, pisando lo que la persona hizo mientras tanto.
 *
 * @param path Ruta absoluta del archivo.
 * @returns La posición, o `undefined` si no había ninguna pendiente.
 * @example
 * const position = takeRestorePosition(path);
 */
export function takeRestorePosition(path: string): RestorablePosition | undefined {
  const position = pending.get(path);

  pending.delete(path);

  return position;
}

/** Descarta todo lo pendiente. Se llama al cambiar de workspace. */
export function clearRestorePositions(): void {
  pending.clear();
}
