import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';
import type { CompletionItem as LspCompletionItem } from 'vscode-languageserver-protocol';

import {
  completionItemsOf,
  isIncompleteCompletion,
  toCompletionItem,
  toDefinitionLocations,
  toHoverResponse,
} from './translate.js';

const PATH = process.platform === 'win32' ? 'C:\\p\\a.ts' : '/p/a.ts';
const URI = pathToFileURL(PATH).toString();

/** Un rango del protocolo, base 0. */
const RANGE = { start: { line: 4, character: 2 }, end: { line: 4, character: 8 } };

describe('toCompletionItem', () => {
  it('lleva el índice como id: es lo único que vuelve para resolverlo', () => {
    expect(toCompletionItem({ label: 'x' }, 7).id).toBe(7);
  });

  it('traduce la clase por nombre y no por número', () => {
    // 3 es `Function` en LSP y otra cosa en Monaco, que es todo el punto.
    expect(toCompletionItem({ label: 'x', kind: 3 }, 0).kind).toBe('function');
  });

  it('usa el label cuando no hay ni insertText ni edición', () => {
    expect(toCompletionItem({ label: 'toString' }, 0).insertText).toBe('toString');
  });

  it('prefiere el newText de la edición por sobre el insertText', () => {
    const item: LspCompletionItem = {
      label: 'x',
      insertText: 'viejo',
      textEdit: { range: RANGE, newText: 'nuevo' },
    };

    expect(toCompletionItem(item, 0).insertText).toBe('nuevo');
  });

  it('traduce el rango de la edición a base 1', () => {
    const item: LspCompletionItem = {
      label: 'x',
      textEdit: { range: RANGE, newText: 'x' },
    };

    expect(toCompletionItem(item, 0).range).toEqual({
      start: { line: 5, column: 3 },
      end: { line: 5, column: 9 },
    });
  });

  it('toma el rango de reemplazo de un InsertReplaceEdit', () => {
    const item: LspCompletionItem = {
      label: 'x',
      textEdit: {
        newText: 'x',
        insert: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        replace: RANGE,
      },
    };

    expect(toCompletionItem(item, 0).range?.start).toEqual({ line: 5, column: 3 });
  });

  it('marca los snippets por su insertTextFormat', () => {
    expect(toCompletionItem({ label: 'x', insertTextFormat: 2 }, 0).isSnippet).toBe(true);
    expect(toCompletionItem({ label: 'x', insertTextFormat: 1 }, 0).isSnippet).toBe(false);
    expect(toCompletionItem({ label: 'x' }, 0).isSnippet).toBe(false);
  });

  it('aplana la documentación con formato', () => {
    const item: LspCompletionItem = {
      label: 'x',
      documentation: { kind: 'markdown', value: '**hola**' },
    };

    expect(toCompletionItem(item, 0).documentation).toBe('**hola**');
  });

  it('deja en null lo que el servidor no mandó', () => {
    const item = toCompletionItem({ label: 'x' }, 0);

    expect([
      item.detail,
      item.documentation,
      item.sortText,
      item.filterText,
      item.range,
    ]).toEqual([null, null, null, null, null]);
  });
});

describe('completionItemsOf', () => {
  it('acepta un array suelto', () => {
    expect(completionItemsOf([{ label: 'x' }])).toHaveLength(1);
  });

  it('acepta una CompletionList', () => {
    expect(completionItemsOf({ isIncomplete: true, items: [{ label: 'x' }] })).toHaveLength(1);
  });

  it('trata null como lista vacía', () => {
    expect(completionItemsOf(null)).toEqual([]);
  });
});

describe('isIncompleteCompletion', () => {
  it('conserva el aviso de la lista incompleta', () => {
    expect(isIncompleteCompletion({ isIncomplete: true, items: [] })).toBe(true);
  });

  it('un array suelto siempre está completo', () => {
    expect(isIncompleteCompletion([{ label: 'x' }])).toBe(false);
  });
});

describe('toHoverResponse', () => {
  it('aplana un MarkupContent', () => {
    expect(toHoverResponse({ contents: { kind: 'markdown', value: '**x**' } })).toEqual({
      contents: '**x**',
      range: null,
    });
  });

  it('aplana un string suelto', () => {
    expect(toHoverResponse({ contents: 'x' }).contents).toBe('x');
  });

  it('envuelve un MarkedString con lenguaje en un bloque de código', () => {
    const hover = toHoverResponse({ contents: { language: 'ts', value: 'const a = 1' } });

    expect(hover.contents).toBe('```ts\nconst a = 1\n```');
  });

  it('junta un array de contenidos', () => {
    expect(toHoverResponse({ contents: ['uno', 'dos'] }).contents).toBe('uno\n\ndos');
  });

  it('traduce el rango a base 1', () => {
    expect(toHoverResponse({ contents: 'x', range: RANGE }).range).toEqual({
      start: { line: 5, column: 3 },
      end: { line: 5, column: 9 },
    });
  });

  it('devuelve null cuando no hay hover', () => {
    expect(toHoverResponse(null)).toEqual({ contents: null, range: null });
  });

  it('devuelve null cuando el contenido queda vacío', () => {
    expect(toHoverResponse({ contents: '' }).contents).toBeNull();
  });
});

describe('toDefinitionLocations', () => {
  it('acepta una ubicación suelta', () => {
    expect(toDefinitionLocations({ uri: URI, range: RANGE })).toEqual([
      { path: PATH, range: { start: { line: 5, column: 3 }, end: { line: 5, column: 9 } } },
    ]);
  });

  it('acepta varias: elegir una escondería la mitad de la respuesta', () => {
    expect(
      toDefinitionLocations([
        { uri: URI, range: RANGE },
        { uri: URI, range: RANGE },
      ])
    ).toHaveLength(2);
  });

  it('acepta la forma de link y toma su rango de selección', () => {
    expect(
      toDefinitionLocations([
        { targetUri: URI, targetRange: RANGE, targetSelectionRange: RANGE },
      ])
    ).toHaveLength(1);
  });

  it('descarta lo que no es un archivo del disco', () => {
    expect(toDefinitionLocations({ uri: 'untitled:x', range: RANGE })).toEqual([]);
  });

  it('trata null como lista vacía', () => {
    expect(toDefinitionLocations(null)).toEqual([]);
  });
});
