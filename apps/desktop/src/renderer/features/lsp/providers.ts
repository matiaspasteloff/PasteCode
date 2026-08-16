import type { CompletionItemKind } from '@pastecode/core';
import { LANGUAGE_SERVERS } from '@pastecode/core';
import type { CompletionItem } from '@pastecode/ipc-contract';
import type * as MonacoApi from 'monaco-editor/editor/editor.api';

import { flushDocumentChanges, hasLanguageServer } from './document-sync.js';

/** De dónde salió cada sugerencia, para poder resolverla. */
interface CompletionOrigin {
  readonly serverId: string;
  readonly id: number;
}

/**
 * Qué ítem del main produjo cada sugerencia de Monaco.
 *
 * Es un `WeakMap` sobre el objeto que Monaco devuelve a `resolveCompletionItem`
 * —que es la misma instancia que se le entregó— en vez de un campo extra
 * adentro del ítem: `languages.CompletionItem` es un tipo cerrado, y colgarle
 * propiedades que no declara es exactamente la aserción que
 * [codigo.md](../../../../../docs/convenciones/codigo.md) prohíbe. Que sea
 * débil además significa que cerrar el popup libera todo solo.
 */
const origins = new WeakMap<MonacoApi.languages.CompletionItem, CompletionOrigin>();

/**
 * Registra los proveedores de completado, hover y definición.
 *
 * Se registran para **todos los lenguajes de la tabla**, hayan arrancado o no
 * sus servidores: un proveedor que devuelve una lista vacía no cuesta nada, y
 * registrarlos por servidor obligaría a registrar y desregistrar a medida que
 * los procesos van y vienen.
 *
 * @param monaco El namespace, ya cargado.
 * @returns Los tres registros, para desecharlos al desmontar.
 * @example
 * const disposables = registerLspProviders(monaco);
 */
export function registerLspProviders(
  monaco: typeof MonacoApi
): readonly MonacoApi.IDisposable[] {
  return LANGUAGE_SERVERS.flatMap((server) => [
    monaco.languages.registerCompletionItemProvider(
      [...server.languageIds],
      completionProvider(monaco, server.completionTriggers)
    ),
    monaco.languages.registerHoverProvider([...server.languageIds], hoverProvider()),
    monaco.languages.registerDefinitionProvider(
      [...server.languageIds],
      definitionProvider(monaco)
    ),
  ]);
}

/** El proveedor de completado ([RF-402](../../../../../docs/03-requerimientos-funcionales.md)). */
function completionProvider(
  monaco: typeof MonacoApi,
  triggerCharacters: readonly string[]
): MonacoApi.languages.CompletionItemProvider {
  return {
    triggerCharacters: [...triggerCharacters],

    async provideCompletionItems(model, position, context) {
      const path = model.uri.fsPath;

      if (!hasLanguageServer(path)) return { suggestions: [] };

      // Primero se descarga lo pendiente: sin esto el servidor contesta sobre
      // el documento de hace hasta 50ms, que en medio de una palabra es otro
      // documento. Es la regla 4 de ADR-0018.
      await flushDocumentChanges(path);

      const result = await window.pastecode.invoke('lsp:completion', {
        path,
        position: { line: position.lineNumber, column: position.column },
        triggerCharacter: context.triggerCharacter ?? null,
      });

      if (!result.ok) return { suggestions: [] };

      const fallback = wordRange(monaco, model, position);

      return {
        incomplete: result.value.isIncomplete,
        suggestions: result.value.items.map((item) =>
          toSuggestion(monaco, item, fallback, model.getLanguageId())
        ),
      };
    },

    async resolveCompletionItem(item) {
      const origin = origins.get(item);

      if (origin === undefined) return item;

      const result = await window.pastecode.invoke('lsp:resolveCompletion', origin);

      if (!result.ok || result.value.item === null) return item;

      const { detail, documentation } = result.value.item;

      // Las claves se omiten en vez de mandarse en `undefined`: con
      // `exactOptionalPropertyTypes` no son lo mismo, y "el servidor no mandó
      // documentación" no puede pisar la que ya había.
      return {
        ...item,
        ...(detail === null ? {} : { detail }),
        ...(documentation === null ? {} : { documentation }),
      };
    },
  };
}

/** Un ítem del contrato, como sugerencia de Monaco. */
function toSuggestion(
  monaco: typeof MonacoApi,
  item: CompletionItem,
  fallbackRange: MonacoApi.IRange,
  languageId: string
): MonacoApi.languages.CompletionItem {
  const suggestion: MonacoApi.languages.CompletionItem = {
    label: item.label,
    kind: monacoKind(monaco, item.kind),
    insertText: item.insertText,
    range: item.range === null ? fallbackRange : toMonacoRange(item.range),
    ...(item.detail === null ? {} : { detail: item.detail }),
    ...(item.documentation === null ? {} : { documentation: item.documentation }),
    ...(item.sortText === null ? {} : { sortText: item.sortText }),
    ...(item.filterText === null ? {} : { filterText: item.filterText }),
    ...(item.isSnippet
      ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
      : {}),
  };

  origins.set(suggestion, { serverId: serverIdFor(languageId), id: item.id });

  return suggestion;
}

/** El servidor que atiende un lenguaje, según la tabla. */
function serverIdFor(languageId: string): string {
  return (
    LANGUAGE_SERVERS.find((server) => server.languageIds.includes(languageId))?.serverId ?? ''
  );
}

/** El proveedor de hover ([RF-404](../../../../../docs/03-requerimientos-funcionales.md)). */
function hoverProvider(): MonacoApi.languages.HoverProvider {
  return {
    async provideHover(model, position) {
      const path = model.uri.fsPath;

      if (!hasLanguageServer(path)) return null;

      await flushDocumentChanges(path);

      const result = await window.pastecode.invoke('lsp:hover', {
        path,
        position: { line: position.lineNumber, column: position.column },
      });

      if (!result.ok || result.value.contents === null) return null;

      return {
        contents: [{ value: result.value.contents }],
        ...(result.value.range === null ? {} : { range: toMonacoRange(result.value.range) }),
      };
    },
  };
}

/**
 * El proveedor de "ir a definición" ([RF-405](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * **Limitación conocida:** una definición que caiga fuera del workspace —el
 * `lib.d.ts` de TypeScript, por ejemplo— se ofrece igual, pero abrirla falla
 * con `PATH_OUTSIDE_WORKSPACE`. Es RNF-11 funcionando como está escrito, y
 * tallarle una excepción al guard de rutas para esto sería cambiar la regla que
 * protege todo lo demás.
 */
function definitionProvider(monaco: typeof MonacoApi): MonacoApi.languages.DefinitionProvider {
  return {
    async provideDefinition(model, position) {
      const path = model.uri.fsPath;

      if (!hasLanguageServer(path)) return null;

      await flushDocumentChanges(path);

      const result = await window.pastecode.invoke('lsp:definition', {
        path,
        position: { line: position.lineNumber, column: position.column },
      });

      if (!result.ok) return null;

      return result.value.locations.map((location) => ({
        uri: monaco.Uri.file(location.path),
        range: toMonacoRange(location.range),
      }));
    },
  };
}

/** El rango que Monaco reemplazaría si el servidor no especificó ninguno. */
function wordRange(
  monaco: typeof MonacoApi,
  model: MonacoApi.editor.ITextModel,
  position: MonacoApi.Position
): MonacoApi.IRange {
  const word = model.getWordUntilPosition(position);

  return new monaco.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    word.endColumn
  );
}

/** Un rango del contrato, en la forma de Monaco. Las dos convenciones son base 1. */
function toMonacoRange(range: CompletionItem['range'] & object): MonacoApi.IRange {
  return {
    startLineNumber: range.start.line,
    startColumn: range.start.column,
    endLineNumber: range.end.line,
    endColumn: range.end.column,
  };
}

/**
 * La clase de Monaco equivalente a la del contrato.
 *
 * Es un mapa y no un índice porque los dos enums **no coinciden**: `Method` es
 * 2 en LSP y 0 en Monaco. Es exactamente la razón por la que por el contrato
 * viaja un nombre y no un número.
 */
function monacoKind(
  monaco: typeof MonacoApi,
  kind: CompletionItemKind
): MonacoApi.languages.CompletionItemKind {
  const { CompletionItemKind } = monaco.languages;
  const byName: Record<CompletionItemKind, MonacoApi.languages.CompletionItemKind> = {
    text: CompletionItemKind.Text,
    method: CompletionItemKind.Method,
    function: CompletionItemKind.Function,
    constructor: CompletionItemKind.Constructor,
    field: CompletionItemKind.Field,
    variable: CompletionItemKind.Variable,
    class: CompletionItemKind.Class,
    interface: CompletionItemKind.Interface,
    module: CompletionItemKind.Module,
    property: CompletionItemKind.Property,
    unit: CompletionItemKind.Unit,
    value: CompletionItemKind.Value,
    enum: CompletionItemKind.Enum,
    keyword: CompletionItemKind.Keyword,
    snippet: CompletionItemKind.Snippet,
    color: CompletionItemKind.Color,
    file: CompletionItemKind.File,
    reference: CompletionItemKind.Reference,
    folder: CompletionItemKind.Folder,
    enumMember: CompletionItemKind.EnumMember,
    constant: CompletionItemKind.Constant,
    struct: CompletionItemKind.Struct,
    event: CompletionItemKind.Event,
    operator: CompletionItemKind.Operator,
    typeParameter: CompletionItemKind.TypeParameter,
  };

  return byName[kind];
}
