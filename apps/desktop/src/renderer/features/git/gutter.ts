import type { DiffHunk } from '@pastecode/core';
import type * as MonacoApi from 'monaco-editor/editor/editor.api';

import { getActiveEditor, getLoadedMonaco } from '../editor/monaco-instance.js';
import { isSamePath } from '../editor/same-path.js';

/**
 * Las decoraciones puestas, para poder reemplazarlas.
 *
 * Es una colección de Monaco y no una lista de ids: la colección sigue las
 * ediciones —una línea insertada arriba corre las marcas de abajo— y se
 * reemplaza entera con `set`, que es exactamente el ciclo de vida que estas
 * marcas tienen.
 */
let collection: MonacoApi.editor.IEditorDecorationsCollection | null = null;

/**
 * Vuelve a pedir el diff del archivo y repinta el gutter ([RF-605](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * **Nunca se llama al tipear.** Sus disparadores son guardar, el watcher y las
 * operaciones de git, y los tres llegan por el mismo `git:changed` que ya viene
 * con debounce del main. Pedir un diff por tecla sería un proceso por
 * pulsación, que es lo que RNF-02 no aguanta.
 *
 * Sólo se decora el archivo que está a la vista: los otros no tienen gutter que
 * pintar.
 *
 * @param path Ruta absoluta del archivo activo, o `null` si no hay ninguno.
 * @example
 * await refreshGutter(activePath);
 */
export async function refreshGutter(path: string | null): Promise<void> {
  if (path === null) {
    clearGutter();
    return;
  }

  const result = await window.pastecode.invoke('git:getFileDiff', { path });

  if (!result.ok) {
    clearGutter();
    return;
  }

  applyHunks(path, result.value.hunks);
}

/** Saca las marcas. Se usa al quedarse sin pestañas y al cambiar de workspace. */
export function clearGutter(): void {
  collection?.clear();
}

/** Pone las marcas en el editor, si el archivo sigue siendo el que se ve. */
function applyHunks(path: string, hunks: readonly DiffHunk[]): void {
  const monaco = getLoadedMonaco();
  const editor = getActiveEditor();

  if (monaco === null || editor === null) return;

  // Entre que se pidió el diff y que llegó, la persona pudo cambiar de pestaña.
  // Pintarlo igual dejaría las marcas de un archivo sobre otro.
  if (!isSamePath(editor.getModel()?.uri.fsPath, path)) return;

  collection ??= editor.createDecorationsCollection();
  collection.set(hunks.map((hunk) => toDecoration(monaco, hunk)));
}

/** Un bloque como decoración de línea. */
function toDecoration(
  monaco: typeof MonacoApi,
  hunk: DiffHunk
): MonacoApi.editor.IModelDeltaDecoration {
  // Un borrado abarca cero líneas: la marca va en el borde superior de la línea
  // que quedó, que es lo que dibujan el resto de los editores.
  const endLine = hunk.lineCount === 0 ? hunk.startLine : hunk.startLine + hunk.lineCount - 1;

  return {
    range: new monaco.Range(hunk.startLine, 1, endLine, 1),
    options: {
      // `isWholeLine` en false y sólo `linesDecorationsClassName`: lo que se
      // pinta es la franja del gutter, no la línea entera. Pintar la línea
      // pelearía con la selección y con los subrayados del LSP.
      isWholeLine: false,
      linesDecorationsClassName: `git-gutter git-gutter--${hunk.kind}`,
      // Sobrevive a que alguien escriba justo en el borde del bloque, en vez de
      // tragarse la edición adentro de la marca.
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  };
}
