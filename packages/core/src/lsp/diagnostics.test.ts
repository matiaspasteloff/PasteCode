import { describe, expect, it } from 'vitest';

import type { Diagnostic, DiagnosticSeverity } from './diagnostics.js';
import { diagnosticSeverityFromLsp, limitDiagnostics } from './diagnostics.js';

/** Un diagnóstico cualquiera con la severidad que pida el test. */
function diagnostic(severity: DiagnosticSeverity, message = 'x'): Diagnostic {
  return {
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    severity,
    message,
    source: null,
    code: null,
  };
}

describe('diagnosticSeverityFromLsp', () => {
  it('traduce los cuatro valores del protocolo', () => {
    expect([1, 2, 3, 4].map(diagnosticSeverityFromLsp)).toEqual([
      'error',
      'warning',
      'info',
      'hint',
    ]);
  });

  it('trata la ausencia como error', () => {
    expect(diagnosticSeverityFromLsp(undefined)).toBe('error');
  });

  it('trata un valor fuera de rango como error', () => {
    expect(diagnosticSeverityFromLsp(99)).toBe('error');
  });
});

describe('limitDiagnostics', () => {
  it('no toca una lista que entra en el tope', () => {
    const list = [diagnostic('error'), diagnostic('warning')];

    expect(limitDiagnostics(list, 5)).toEqual({ diagnostics: list, truncated: false });
  });

  it('devuelve una copia y no la lista original', () => {
    const list = [diagnostic('error')];

    expect(limitDiagnostics(list, 5).diagnostics).not.toBe(list);
  });

  it('recorta y avisa cuando se pasa', () => {
    const list = [diagnostic('error'), diagnostic('warning'), diagnostic('hint')];
    const limited = limitDiagnostics(list, 2);

    expect(limited.diagnostics).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });

  it('conserva lo más grave al recortar', () => {
    const list = [
      diagnostic('hint', 'hint'),
      diagnostic('info', 'info'),
      diagnostic('error', 'error'),
    ];

    expect(limitDiagnostics(list, 1).diagnostics.map((item) => item.message)).toEqual([
      'error',
    ]);
  });

  it('trata un tope inválido como uno', () => {
    expect(
      limitDiagnostics([diagnostic('error'), diagnostic('error')], 0).diagnostics
    ).toHaveLength(1);
  });
});
