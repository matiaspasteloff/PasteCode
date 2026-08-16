import type { Diagnostic } from '@pastecode/core';
import type * as MonacoApi from 'monaco-editor/editor/editor.api';

import { getLoadedMonaco } from '../editor/monaco-instance.js';

/**
 * Quién es el dueño de estos marcadores.
 *
 * Monaco indexa los marcadores por dueño, así que reemplazar los del LSP no
 * toca los que pueda poner otra cosa —el linter de una extensión, en la Etapa
 * 5— y viceversa. Con un dueño compartido, el último en escribir borraría los
 * del otro.
 */
const MARKER_OWNER = 'pastecode-lsp';

/**
 * Pinta los diagnósticos de un archivo en su modelo, si está vivo.
 *
 * **Sólo para modelos vivos**, y no es una optimización: `setModelMarkers`
 * necesita el `ITextModel`, y los diagnósticos llegan también de archivos que
 * nadie abrió —que es la mitad del valor del panel de problemas—. Esos se
 * guardan en el store y se pintan recién si alguien los abre.
 *
 * @param path Ruta absoluta del archivo.
 * @param diagnostics Los diagnósticos, en coordenadas base 1.
 * @example
 * applyMarkers('C:\\p\\a.ts', diagnostics);
 */
export function applyMarkers(path: string, diagnostics: readonly Diagnostic[]): void {
  const monaco = getLoadedMonaco();

  if (monaco === null) return;

  const model = monaco.editor.getModel(monaco.Uri.file(path));

  if (model === null) return;

  monaco.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    diagnostics.map((diagnostic) => toMarker(monaco, diagnostic))
  );
}

/** Un diagnóstico del contrato, como marcador de Monaco. */
function toMarker(
  monaco: typeof MonacoApi,
  diagnostic: Diagnostic
): MonacoApi.editor.IMarkerData {
  return {
    // Las dos convenciones son base 1, así que no hay conversión: la única del
    // proyecto vive en `main/lsp` y termina antes de que esto exista.
    startLineNumber: diagnostic.range.start.line,
    startColumn: diagnostic.range.start.column,
    endLineNumber: diagnostic.range.end.line,
    endColumn: diagnostic.range.end.column,
    severity: severityOf(monaco, diagnostic.severity),
    message: diagnostic.message,
    ...(diagnostic.source === null ? {} : { source: diagnostic.source }),
    ...(diagnostic.code === null ? {} : { code: diagnostic.code }),
  };
}

/** La severidad de Monaco equivalente. */
function severityOf(
  monaco: typeof MonacoApi,
  severity: Diagnostic['severity']
): MonacoApi.MarkerSeverity {
  if (severity === 'error') return monaco.MarkerSeverity.Error;
  if (severity === 'warning') return monaco.MarkerSeverity.Warning;
  if (severity === 'info') return monaco.MarkerSeverity.Info;

  return monaco.MarkerSeverity.Hint;
}
