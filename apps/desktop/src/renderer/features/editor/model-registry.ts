import type * as MonacoApi from 'monaco-editor/editor/editor.api';

import { languageOverrideFor } from './language.js';

/** Lo que hay que recordar de una pestaña que no está a la vista. */
interface RegisteredModel {
  model: MonacoApi.editor.ITextModel;
  /** Cursor, selección, scroll y estado del plegado. Lo serializa Monaco. */
  viewState: MonacoApi.editor.ICodeEditorViewState | null;
}

/**
 * Los modelos de Monaco de los archivos abiertos, indexados por ruta.
 *
 * **Una sola instancia de editor y N modelos**, y no N editores. Es la
 * decisión que hace que [RF-106](../../../../../../docs/03-requerimientos-funcionales.md)
 * —deshacer independiente por archivo, preservado mientras la pestaña esté
 * abierta— salga gratis: el historial de undo vive en el `ITextModel`, no en
 * el editor, así que cambiar de pestaña con `setModel` lo conserva solo. Con
 * un editor por pestaña habría que montar y desmontar widgets enteros, que es
 * caro y no aporta nada.
 *
 * Lo que **no** sale gratis es el cursor y el scroll: esos sí son del editor,
 * y por eso se guardan y se restauran a mano en cada cambio de pestaña.
 *
 * El registro es un módulo con estado y no un store de Zustand a propósito:
 * son objetos de Monaco que hay que desechar a mano, no datos que la UI
 * renderice. Meterlos en un store invitaría a compararlos por identidad en un
 * selector, que es justo lo que no hay que hacer con ellos.
 */
const models = new Map<string, RegisteredModel>();

/**
 * Deja el modelo del archivo con el contenido que se acaba de leer del disco.
 *
 * **Sobrescribe si el modelo ya existía**, y eso es deliberado: quien llama
 * sólo tiene contenido fresco cuando de verdad se leyó el disco, y eso pasa en
 * dos momentos —la primera apertura, y descartar los cambios ante un
 * conflicto—. En los dos, lo correcto es que gane el disco. Cambiar de pestaña
 * **no** pasa por acá justo para que las ediciones sin guardar sobrevivan.
 *
 * `setValue` además vacía el historial de deshacer, que es lo que se espera de
 * un "descartar mis cambios": no tendría sentido poder deshacer hasta antes de
 * descartar.
 *
 * @param monaco El namespace de Monaco, ya cargado.
 * @param path Ruta absoluta del archivo.
 * @param content Contenido leído del disco.
 * @returns El modelo, listo para `setModel`.
 * @example
 * syncModelWithDisk(monaco, path, content);
 */
export function syncModelWithDisk(
  monaco: typeof MonacoApi,
  path: string,
  content: string
): MonacoApi.editor.ITextModel {
  const existing = models.get(path);
  if (existing !== undefined) {
    existing.model.setValue(content);
    return existing.model;
  }

  const created = monaco.editor.createModel(
    content,
    languageOverrideFor(path.split(/[\\/]/).at(-1) ?? ''),
    monaco.Uri.file(path)
  );
  models.set(path, { model: created, viewState: null });

  return created;
}

/**
 * Guarda la posición del cursor y el scroll de la pestaña que se está dejando.
 *
 * @param path Ruta del archivo que se abandona.
 * @param viewState Lo que devolvió `editor.saveViewState()`.
 * @example
 * rememberViewState(previousPath, editor.saveViewState());
 */
export function rememberViewState(
  path: string,
  viewState: MonacoApi.editor.ICodeEditorViewState | null
): void {
  const registered = models.get(path);
  if (registered !== undefined) registered.viewState = viewState;
}

/**
 * El estado de vista guardado de un archivo, si lo hay.
 *
 * @param path Ruta del archivo.
 * @returns El estado de vista, o `null` si nunca se guardó.
 * @example
 * editor.restoreViewState(savedViewState(path));
 */
export function savedViewState(path: string): MonacoApi.editor.ICodeEditorViewState | null {
  return models.get(path)?.viewState ?? null;
}

/**
 * Desecha los modelos que ya no corresponden a ninguna pestaña abierta.
 *
 * **Es obligatorio.** Un modelo que no se desecha no lo recoge el recolector
 * de basura: Monaco lo mantiene en su propio índice por URI. Abrir y cerrar
 * cincuenta archivos dejaría los cincuenta en memoria, que es lo que
 * [RNF-04](../../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * —400MB con tres pestañas— hace notar enseguida.
 *
 * Y no es sólo memoria: como el índice es por URI, un modelo que sobrevive al
 * cierre hace que al reabrir el archivo se devuelva **el modelo viejo**, con
 * el contenido que tenía antes en vez del que hay ahora en el disco.
 *
 * Se reconcilia contra la lista de abiertas en vez de exponer un "cerrá éste"
 * para que el store no tenga que saber que Monaco existe: la lista de
 * pestañas es del store, y el registro se acomoda a ella.
 *
 * @param openPaths Rutas que siguen abiertas.
 * @example
 * releaseModelsExcept(tabs.map((tab) => tab.path));
 */
export function releaseModelsExcept(openPaths: readonly string[]): void {
  const open = new Set(openPaths);

  for (const [path, { model }] of models) {
    if (open.has(path)) continue;

    model.dispose();
    models.delete(path);
  }
}

/**
 * Desecha todos los modelos. Se usa al cambiar de workspace.
 *
 * @example
 * releaseAllModels();
 */
export function releaseAllModels(): void {
  for (const { model } of models.values()) model.dispose();

  models.clear();
}
