import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi } from '../../test-support/fake-api.js';

import {
  closeLspDocument,
  flushDocumentChanges,
  forgetLspDocuments,
  hasLanguageServer,
  openLspDocument,
} from './document-sync.js';

const PATH = 'C:\\p\\a.ts';

/** Un modelo de mentira con lo poco que este módulo le pide a Monaco. */
interface FakeModel {
  readonly model: MonacoApi.editor.ITextModel;
  /** Simula una edición: sube la versión y avisa a los suscriptos. */
  edit(changes: readonly { range: MonacoApi.IRange; text: string }[]): void;
  listenerCount: () => number;
}

/** Un rango de una línea, en la columna que pida el test. */
function range(startColumn: number, endColumn: number): MonacoApi.IRange {
  return { startLineNumber: 1, startColumn, endLineNumber: 1, endColumn };
}

function createFakeModel(path = PATH): FakeModel {
  const listeners = new Set<(event: MonacoApi.editor.IModelContentChangedEvent) => void>();
  let version = 1;

  const model = {
    uri: { fsPath: path },
    getLanguageId: () => 'typescript',
    getVersionId: () => version,
    getValue: () => 'const a = 1;',
    onDidChangeContent: (
      listener: (event: MonacoApi.editor.IModelContentChangedEvent) => void
    ) => {
      listeners.add(listener);

      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
  };

  return {
    // El fake implementa las cinco cosas que `document-sync` usa de un modelo, y
    // `ITextModel` tiene más de cien. Es un límite del sistema —el borde con
    // Monaco— y la alternativa sería montar el editor entero para verificar un
    // debounce. Ver codigo.md, regla 2.
    // eslint-disable-next-line no-restricted-syntax
    model: model as unknown as MonacoApi.editor.ITextModel,

    edit(changes) {
      version += 1;

      for (const listener of listeners) {
        // Ídem: el evento real trae `eol`, `versionId` e `isFlush`, que este
        // módulo no mira.
        // eslint-disable-next-line no-restricted-syntax
        listener({ changes } as unknown as MonacoApi.editor.IModelContentChangedEvent);
      }
    },

    listenerCount: () => listeners.size,
  };
}

/** Instala el api falso con las tres respuestas que el módulo necesita. */
function install(serverId: string | null) {
  return installFakeApi({
    'lsp:openDocument': { ok: true, value: { serverId } },
    'lsp:changeDocument': { ok: true, value: {} },
    'lsp:closeDocument': { ok: true, value: {} },
  });
}

describe('openLspDocument', () => {
  afterEach(() => {
    forgetLspDocuments();
  });

  it('manda el documento entero una sola vez, al abrirlo', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);

    expect(invoke).toHaveBeenCalledWith('lsp:openDocument', {
      path: PATH,
      languageId: 'typescript',
      version: 1,
      text: 'const a = 1;',
    });
  });

  it('no sigue un archivo que no tiene servidor', async () => {
    install(null);
    const fake = createFakeModel();

    await openLspDocument(fake.model);

    expect(hasLanguageServer(PATH)).toBe(false);
    expect(fake.listenerCount()).toBe(0);
  });

  it('no se suscribe dos veces al reabrir después de un reinicio', async () => {
    install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    await openLspDocument(fake.model);

    // Con dos suscripciones cada tecla mandaría sus cambios duplicados, que es
    // exactamente cómo se desincroniza un servidor para siempre.
    expect(fake.listenerCount()).toBe(1);
  });
});

describe('sincronización incremental', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    forgetLspDocuments();
    vi.useRealTimers();
  });

  it('no manda nada mientras se está tipeando', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    fake.edit([{ range: range(1, 1), text: 'a' }]);
    await vi.advanceTimersByTimeAsync(40);

    expect(invoke).not.toHaveBeenCalledWith('lsp:changeDocument', expect.anything());
  });

  it('descarga los cambios acumulados al dejar de tipear', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    fake.edit([{ range: range(1, 1), text: 'a' }]);
    fake.edit([{ range: range(2, 2), text: 'b' }]);
    await vi.advanceTimersByTimeAsync(60);

    expect(invoke).toHaveBeenCalledWith('lsp:changeDocument', {
      path: PATH,
      version: 3,
      changes: [
        { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, text: 'a' },
        { range: { start: { line: 1, column: 2 }, end: { line: 1, column: 2 } }, text: 'b' },
      ],
    });
  });

  it('conserva el orden de los cambios de una edición multi-cursor', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    // Monaco los emite de atrás hacia adelante justamente para que aplicarlos
    // en secuencia no invalide los desplazamientos de los que quedan.
    fake.edit([
      { range: range(9, 9), text: 'x' },
      { range: range(2, 2), text: 'x' },
    ]);
    await vi.advanceTimersByTimeAsync(60);

    const call = invoke.mock.calls.find(([channel]) => channel === 'lsp:changeDocument');
    const payload = call?.[1];

    expect(JSON.stringify(payload)).toContain('"column":9');
    expect(JSON.stringify(payload).indexOf('"column":9')).toBeLessThan(
      JSON.stringify(payload).indexOf('"column":2')
    );
  });

  it('descarga igual al llegar al techo, aunque no se pare de tipear', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);

    for (let index = 0; index < 8; index += 1) {
      fake.edit([{ range: range(1, 1), text: 'a' }]);
      await vi.advanceTimersByTimeAsync(40);
    }

    expect(
      invoke.mock.calls.filter(([channel]) => channel === 'lsp:changeDocument').length
    ).toBeGreaterThan(0);
  });

  it('descarga ahora mismo cuando se lo piden', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    fake.edit([{ range: range(1, 1), text: 'a' }]);
    await flushDocumentChanges(PATH);

    expect(invoke).toHaveBeenCalledWith('lsp:changeDocument', expect.anything());
  });

  it('no manda un lote vacío al descargar dos veces seguidas', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    fake.edit([{ range: range(1, 1), text: 'a' }]);
    await flushDocumentChanges(PATH);
    await flushDocumentChanges(PATH);

    expect(
      invoke.mock.calls.filter(([channel]) => channel === 'lsp:changeDocument')
    ).toHaveLength(1);
  });
});

describe('closeLspDocument', () => {
  afterEach(() => {
    forgetLspDocuments();
  });

  it('avisa al main y deja de seguir el archivo', async () => {
    const invoke = install('typescript');
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    await closeLspDocument(fake.model);

    expect(invoke).toHaveBeenCalledWith('lsp:closeDocument', { path: PATH });
    expect(hasLanguageServer(PATH)).toBe(false);
    expect(fake.listenerCount()).toBe(0);
  });

  it('no avisa por un archivo que no estaba siguiendo', async () => {
    const invoke = install(null);
    const fake = createFakeModel();

    await openLspDocument(fake.model);
    await closeLspDocument(fake.model);

    expect(invoke).not.toHaveBeenCalledWith('lsp:closeDocument', expect.anything());
  });
});
