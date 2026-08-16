import { fileURLToPath } from 'node:url';

import type { Diagnostic, DocumentDiagnostics } from '@pastecode/core';
import { diagnosticSeverityFromLsp, fromLspRange, limitDiagnostics } from '@pastecode/core';
import type {
  Diagnostic as LspDiagnostic,
  PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol';

/**
 * Cuántos documentos se acumulan antes de mandar un lote.
 *
 * Son los mismos 50 y los mismos 30ms que ya usa `services/search.ts`, y por la
 * misma razón: un salto de proceso por documento cuesta más que el análisis.
 * Un `tsc` sobre un proyecto con el `tsconfig` roto publica cientos de
 * documentos en ráfaga, y eso en el hilo de UI es lo que rompe RNF-06.
 */
const BATCH_SIZE = 50;

/** Cada cuánto se vacía el lote aunque no esté lleno, en milisegundos. */
const BATCH_INTERVAL_MS = 30;

/** Acumula diagnósticos y los entrega de a lotes. */
export interface DiagnosticsBatcher {
  publish(serverId: string, document: DocumentDiagnostics): void;
  /** Manda lo acumulado ahora mismo. */
  flush(): void;
  /** Corta el temporizador. Se llama al apagar. */
  dispose(): void;
}

/**
 * Traduce lo que publicó el servidor a la forma del contrato.
 *
 * @param params Lo que llegó por `textDocument/publishDiagnostics`.
 * @param maxPerFile Tope de `lsp.maxDiagnosticsPerFile`.
 * @returns El documento con sus diagnósticos, o `null` si el `uri` no es un
 * archivo del disco —los servidores publican sobre esquemas propios, y una
 * ruta que no existe no le sirve a nadie—.
 * @example
 * toDocumentDiagnostics(params, 200);
 */
export function toDocumentDiagnostics(
  params: PublishDiagnosticsParams,
  maxPerFile: number
): DocumentDiagnostics | null {
  const path = filePathOf(params.uri);

  if (path === null) return null;

  const limited = limitDiagnostics(params.diagnostics.map(toDiagnostic), maxPerFile);

  return { path, diagnostics: limited.diagnostics, truncated: limited.truncated };
}

/** Un diagnóstico del protocolo, en las coordenadas base 1 del contrato. */
function toDiagnostic(diagnostic: LspDiagnostic): Diagnostic {
  return {
    range: fromLspRange(diagnostic.range),
    severity: diagnosticSeverityFromLsp(diagnostic.severity),
    message: diagnostic.message,
    source: diagnostic.source ?? null,
    // LSP permite el código como número o como string. Se normaliza a texto
    // porque para la UI es una etiqueta —`TS2304`, `no-unused-vars`— y no un
    // número con el que se vaya a hacer aritmética.
    code: diagnostic.code === undefined ? null : String(diagnostic.code),
  };
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

/**
 * Crea el acumulador de diagnósticos.
 *
 * Se transfiere entero el patrón de `services/search.ts`, que resuelve el mismo
 * problema: un productor que empuja a su ritmo y un consumidor del otro lado de
 * un salto de proceso.
 *
 * Los lotes se agrupan **por servidor** porque el evento los identifica: dos
 * servidores publicando a la vez no tienen por qué mezclarse en un lote cuyo
 * `serverId` sería mentira para la mitad.
 *
 * @param onBatch Adónde va cada lote.
 * @returns El acumulador.
 * @example
 * const batcher = createDiagnosticsBatcher((serverId, documents) => emit(...));
 * batcher.publish('typescript', document);
 */
export function createDiagnosticsBatcher(
  onBatch: (serverId: string, documents: DocumentDiagnostics[]) => void
): DiagnosticsBatcher {
  const batches = new Map<string, DocumentDiagnostics[]>();

  const flush = (): void => {
    for (const [serverId, documents] of batches) {
      if (documents.length > 0) onBatch(serverId, documents);
    }

    batches.clear();
  };

  const timer = setInterval(flush, BATCH_INTERVAL_MS);

  // Sin esto, un temporizador de 30ms mantiene vivo el event loop del main y
  // la app no cierra sola cuando la última ventana se va.
  timer.unref();

  return {
    publish(serverId, document) {
      const batch = batches.get(serverId) ?? [];

      // Se reemplaza y no se acumula: una publicación trae la lista completa
      // del archivo, y dos entradas del mismo path en un lote harían que la
      // vieja pise a la nueva del lado del renderer.
      batches.set(serverId, [...batch.filter((item) => item.path !== document.path), document]);

      if ((batches.get(serverId)?.length ?? 0) >= BATCH_SIZE) flush();
    },

    flush,

    dispose() {
      clearInterval(timer);
      batches.clear();
    },
  };
}
