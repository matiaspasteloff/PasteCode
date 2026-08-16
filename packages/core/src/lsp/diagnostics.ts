import type { DocumentRange } from './positions.js';

/**
 * Las severidades, en el orden de LSP: 1 error, 2 warning, 3 info, 4 hint.
 *
 * Mismo criterio que `COMPLETION_KINDS`: por el contrato viaja el nombre y no
 * el número, para que el significado no dependa de qué versión de qué enum lea
 * cada lado.
 */
export const DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'info', 'hint'] as const;

export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

/** Un diagnóstico, en coordenadas base 1. */
export interface Diagnostic {
  readonly range: DocumentRange;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** Quién lo produjo (`ts`, `eslint`). `null` si el servidor no lo dijo. */
  readonly source: string | null;
  /** El código del error, ya como texto. LSP lo permite numérico o string. */
  readonly code: string | null;
}

/**
 * Los diagnósticos de un archivo.
 *
 * Se guardan **aunque el archivo no tenga un modelo abierto**: que el panel de
 * problemas muestre errores de archivos que no abriste es la mitad de su valor,
 * y es lo que un `tsc --noEmit` produce naturalmente.
 */
export interface DocumentDiagnostics {
  readonly path: string;
  readonly diagnostics: readonly Diagnostic[];
  /** Si se recortaron por `lsp.maxDiagnosticsPerFile`. */
  readonly truncated: boolean;
}

/**
 * Traduce la severidad del protocolo.
 *
 * @param severity El número del protocolo, o `undefined`.
 * @returns El nombre. La ausencia es `'error'`, que es lo que dice la spec:
 * queda a criterio del cliente, y esconder un problema es peor que mostrarlo
 * más fuerte de lo que era.
 * @example
 * diagnosticSeverityFromLsp(2); // 'warning'
 */
export function diagnosticSeverityFromLsp(severity: number | undefined): DiagnosticSeverity {
  if (severity === undefined) return 'error';

  return DIAGNOSTIC_SEVERITIES[severity - 1] ?? 'error';
}

/**
 * Recorta la lista al tope y avisa si sobró algo.
 *
 * El tope es `lsp.maxDiagnosticsPerFile` y existe por RNF-06: un `tsconfig`
 * roto produce miles de errores en un archivo, y pintarlos todos es trabajo en
 * el hilo de UI para una lista que nadie va a leer entera. Se ordenan por
 * severidad antes de cortar, así que lo que se pierde son hints y no errores.
 *
 * @param diagnostics Lo que publicó el servidor.
 * @param max Cuántos como máximo. Menor a 1 se trata como 1.
 * @returns La lista recortada y si hubo recorte.
 * @example
 * limitDiagnostics(diagnostics, 200);
 */
export function limitDiagnostics(
  diagnostics: readonly Diagnostic[],
  max: number
): { diagnostics: Diagnostic[]; truncated: boolean } {
  const limit = Math.max(1, max);

  if (diagnostics.length <= limit) {
    return { diagnostics: [...diagnostics], truncated: false };
  }

  const ordered = [...diagnostics].sort(
    (left, right) => severityRank(left.severity) - severityRank(right.severity)
  );

  return { diagnostics: ordered.slice(0, limit), truncated: true };
}

/** Menor es más grave. Es el índice en `DIAGNOSTIC_SEVERITIES`. */
function severityRank(severity: DiagnosticSeverity): number {
  return DIAGNOSTIC_SEVERITIES.indexOf(severity);
}
