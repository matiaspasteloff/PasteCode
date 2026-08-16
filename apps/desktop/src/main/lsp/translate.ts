import { fileURLToPath } from 'node:url';

import type { DocumentRange } from '@pastecode/core';
import { completionKindFromLsp, fromLspRange } from '@pastecode/core';
import type { CompletionItem, DefinitionLocation } from '@pastecode/ipc-contract';
import type {
  CompletionItem as LspCompletionItem,
  CompletionList,
  Definition,
  DefinitionLink,
  Hover,
  MarkedString,
  MarkupContent,
} from 'vscode-languageserver-protocol';

/**
 * Traduce un ítem de completado del protocolo al del contrato.
 *
 * El `id` es el índice del ítem en la respuesta que lo produjo, y es lo único
 * que el renderer manda de vuelta para resolverlo: el objeto crudo del servidor
 * —con su campo `data` opaco— se queda en el main.
 *
 * @param item Lo que devolvió el servidor.
 * @param id Índice del ítem en su respuesta.
 * @returns El ítem del contrato.
 * @example
 * toCompletionItem(item, 0);
 */
export function toCompletionItem(item: LspCompletionItem, id: number): CompletionItem {
  const range = editRange(item);

  return {
    id,
    label: item.label,
    kind: completionKindFromLsp(item.kind),
    detail: item.detail ?? null,
    documentation: flattenMarkup(item.documentation),
    // El orden importa: si el servidor mandó un `textEdit`, lo que se inserta
    // es su `newText` y no el `insertText`, que la spec deja como respaldo para
    // clientes que no soporten ediciones.
    insertText: editText(item) ?? item.insertText ?? item.label,
    // `InsertTextFormat.Snippet` es 2. El 1 —o la ausencia— es texto liso.
    isSnippet: item.insertTextFormat === 2,
    sortText: item.sortText ?? null,
    filterText: item.filterText ?? null,
    range,
  };
}

/** Los ítems de una respuesta de completado, sea lista o array. */
export function completionItemsOf(
  result: CompletionList | LspCompletionItem[] | null
): LspCompletionItem[] {
  if (result === null) return [];
  if (Array.isArray(result)) return result;

  return result.items;
}

/**
 * Si el servidor avisó que la lista está incompleta.
 *
 * Importa más de lo que parece: es lo que le dice a Monaco que vuelva a
 * preguntar en vez de filtrar del lado del cliente. Perderlo hace que escribir
 * una letra más deje de traer sugerencias nuevas.
 */
export function isIncompleteCompletion(
  result: CompletionList | LspCompletionItem[] | null
): boolean {
  return result !== null && !Array.isArray(result) && result.isIncomplete;
}

/**
 * Aplana el contenido de un hover a markdown.
 *
 * El protocolo permite tres formas —`MarkupContent`, `MarkedString` y un array
 * de éstos— porque las dos últimas están deprecadas desde 3.0 y siguen ahí por
 * compatibilidad. Los servidores reales mandan las tres.
 *
 * @param hover Lo que devolvió el servidor.
 * @returns El markdown y el rango, o contenidos en `null` si no había nada.
 * @example
 * toHoverResponse(hover);
 */
export function toHoverResponse(hover: Hover | null): {
  contents: string | null;
  range: DocumentRange | null;
} {
  if (hover === null) return { contents: null, range: null };

  const contents = flattenHoverContents(hover.contents);

  return {
    contents: contents === '' ? null : contents,
    range: hover.range === undefined ? null : fromLspRange(hover.range),
  };
}

/**
 * Traduce la respuesta de "ir a definición" a una lista de ubicaciones.
 *
 * Es una lista y no una ubicación porque el protocolo puede devolver varias
 * —un símbolo declarado en un `.d.ts` y en su implementación— y elegir por la
 * persona es esconderle la mitad de la respuesta.
 *
 * @param definition Lo que devolvió el servidor.
 * @returns Las ubicaciones que apuntan a archivos del disco.
 * @example
 * toDefinitionLocations(definition);
 */
export function toDefinitionLocations(
  definition: Definition | DefinitionLink[] | null
): DefinitionLocation[] {
  if (definition === null) return [];

  const list = Array.isArray(definition) ? definition : [definition];

  return list.flatMap((entry): DefinitionLocation[] => {
    const uri = 'uri' in entry ? entry.uri : entry.targetUri;
    const range = 'range' in entry ? entry.range : entry.targetSelectionRange;
    const path = filePathOf(uri);

    return path === null ? [] : [{ path, range: fromLspRange(range) }];
  });
}

/** El `newText` de la edición del ítem, si tiene una. */
function editText(item: LspCompletionItem): string | undefined {
  return item.textEdit?.newText;
}

/** El rango que reemplaza el ítem, si el servidor lo especificó. */
function editRange(item: LspCompletionItem): DocumentRange | null {
  const { textEdit } = item;

  if (textEdit === undefined) return null;

  // `InsertReplaceEdit` trae dos rangos. Se toma el de reemplazo: es lo que
  // hace que completar sobre una palabra ya escrita la reemplace en vez de
  // duplicarla, que es lo que la gente espera al completar en el medio.
  const range = 'range' in textEdit ? textEdit.range : textEdit.replace;

  return fromLspRange(range);
}

/** Un `MarkupContent` o un string, como texto. */
function flattenMarkup(documentation: string | MarkupContent | undefined): string | null {
  if (documentation === undefined) return null;
  if (typeof documentation === 'string') return documentation;

  return documentation.value;
}

/** Las tres formas del contenido de un hover, como un solo markdown. */
function flattenHoverContents(contents: Hover['contents']): string {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map(flattenMarkedString).join('\n\n');
  if ('kind' in contents) return contents.value;

  return flattenMarkedString(contents);
}

/**
 * Un `MarkedString`: texto suelto, o código con su lenguaje.
 *
 * El tipo está deprecado desde LSP 3.0 y sigue siendo lo que devuelven varios
 * servidores en producción, así que traducirlo no es opcional. La supresión es
 * la forma de decir que la deprecación se conoce y se está manejando, no que se
 * la ignora.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Ver arriba: hay servidores reales que todavía lo mandan.
function flattenMarkedString(marked: MarkedString): string {
  if (typeof marked === 'string') return marked;

  return `\`\`\`${marked.language}\n${marked.value}\n\`\`\``;
}

/** La ruta del disco de un `file:` URI, o `null` para cualquier otro esquema. */
function filePathOf(uri: string): string | null {
  if (!uri.startsWith('file:')) return null;

  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}
