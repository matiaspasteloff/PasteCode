import { pathToFileURL } from 'node:url';

import type { DocumentDiagnostics } from '@pastecode/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Diagnostic as LspDiagnostic } from 'vscode-languageserver-protocol';

import type { DiagnosticsBatcher } from './diagnostics.js';
import { createDiagnosticsBatcher, toDocumentDiagnostics } from './diagnostics.js';

const PATH = process.platform === 'win32' ? 'C:\\p\\a.ts' : '/p/a.ts';
const URI = pathToFileURL(PATH).toString();

/** Un diagnóstico del protocolo, base 0. */
function lspDiagnostic(overrides: Partial<LspDiagnostic> = {}): LspDiagnostic {
  return {
    range: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
    severity: 1,
    message: 'no existe',
    ...overrides,
  };
}

describe('toDocumentDiagnostics', () => {
  it('traduce el uri a ruta y las coordenadas a base 1', () => {
    const document = toDocumentDiagnostics({ uri: URI, diagnostics: [lspDiagnostic()] }, 200);

    expect(document?.path).toBe(PATH);
    expect(document?.diagnostics[0]?.range).toEqual({
      start: { line: 1, column: 5 },
      end: { line: 1, column: 10 },
    });
  });

  it('normaliza el código numérico a texto', () => {
    const document = toDocumentDiagnostics(
      { uri: URI, diagnostics: [lspDiagnostic({ code: 2304, source: 'ts' })] },
      200
    );

    expect(document?.diagnostics[0]?.code).toBe('2304');
    expect(document?.diagnostics[0]?.source).toBe('ts');
  });

  it('deja el código y la fuente en null cuando el servidor no los mandó', () => {
    const document = toDocumentDiagnostics({ uri: URI, diagnostics: [lspDiagnostic()] }, 200);

    expect(document?.diagnostics[0]?.code).toBeNull();
    expect(document?.diagnostics[0]?.source).toBeNull();
  });

  it('recorta al tope y lo avisa', () => {
    const document = toDocumentDiagnostics(
      { uri: URI, diagnostics: [lspDiagnostic(), lspDiagnostic(), lspDiagnostic()] },
      2
    );

    expect(document?.diagnostics).toHaveLength(2);
    expect(document?.truncated).toBe(true);
  });

  it('descarta lo que no es un archivo del disco', () => {
    expect(
      toDocumentDiagnostics({ uri: 'untitled:Untitled-1', diagnostics: [] }, 200)
    ).toBeNull();
  });

  it('acepta una publicación vacía: así se borran los errores arreglados', () => {
    const document = toDocumentDiagnostics({ uri: URI, diagnostics: [] }, 200);

    expect(document).toEqual({ path: PATH, diagnostics: [], truncated: false });
  });
});

describe('createDiagnosticsBatcher', () => {
  let batcher: DiagnosticsBatcher | undefined;

  afterEach(() => {
    batcher?.dispose();
    batcher = undefined;
  });

  /** Un documento con la ruta que pida el test. */
  function document(path: string): DocumentDiagnostics {
    return { path, diagnostics: [], truncated: false };
  }

  it('no entrega nada hasta que se vacía el lote', () => {
    const batches: string[][] = [];

    batcher = createDiagnosticsBatcher((_serverId, documents) => {
      batches.push(documents.map((item) => item.path));
    });
    batcher.publish('typescript', document('a.ts'));

    expect(batches).toEqual([]);
  });

  it('entrega el lote acumulado al vaciarlo', () => {
    const batches: string[][] = [];

    batcher = createDiagnosticsBatcher((_serverId, documents) => {
      batches.push(documents.map((item) => item.path));
    });
    batcher.publish('typescript', document('a.ts'));
    batcher.publish('typescript', document('b.ts'));
    batcher.flush();

    expect(batches).toEqual([['a.ts', 'b.ts']]);
  });

  it('deja una sola entrada por archivo: la última publicación gana', () => {
    const batches: DocumentDiagnostics[][] = [];

    batcher = createDiagnosticsBatcher((_serverId, documents) => {
      batches.push(documents);
    });
    batcher.publish('typescript', { path: 'a.ts', diagnostics: [], truncated: true });
    batcher.publish('typescript', document('a.ts'));
    batcher.flush();

    expect(batches[0]).toEqual([{ path: 'a.ts', diagnostics: [], truncated: false }]);
  });

  it('separa los lotes por servidor', () => {
    const seen: string[] = [];

    batcher = createDiagnosticsBatcher((serverId) => {
      seen.push(serverId);
    });
    batcher.publish('typescript', document('a.ts'));
    batcher.publish('rust', document('a.rs'));
    batcher.flush();

    expect(seen.toSorted()).toEqual(['rust', 'typescript']);
  });

  it('vacía solo al llegar a los cincuenta documentos', () => {
    const batches: number[] = [];

    batcher = createDiagnosticsBatcher((_serverId, documents) => {
      batches.push(documents.length);
    });

    for (let index = 0; index < 50; index += 1) {
      batcher.publish('typescript', document(`a${String(index)}.ts`));
    }

    expect(batches).toEqual([50]);
  });

  it('no entrega nada después de desecharse', () => {
    const batches: number[] = [];

    batcher = createDiagnosticsBatcher((_serverId, documents) => {
      batches.push(documents.length);
    });
    batcher.publish('typescript', document('a.ts'));
    batcher.dispose();
    batcher.flush();

    expect(batches).toEqual([]);
  });
});
