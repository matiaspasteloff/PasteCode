import type { Diagnostic, DiagnosticSeverity } from '@pastecode/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { countProblems, useProblemsStore } from './problems-store.js';

/** Un diagnóstico con la severidad que pida el test. */
function diagnostic(severity: DiagnosticSeverity): Diagnostic {
  return {
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } },
    severity,
    message: 'roto',
    source: null,
    code: null,
  };
}

describe('useProblemsStore', () => {
  beforeEach(() => {
    useProblemsStore.getState().clear();
  });

  it('guarda los diagnósticos de un archivo', () => {
    useProblemsStore
      .getState()
      .apply([{ path: 'a.ts', diagnostics: [diagnostic('error')], truncated: false }]);

    expect(useProblemsStore.getState().byPath.get('a.ts')?.diagnostics).toHaveLength(1);
  });

  it('reemplaza y no acumula: la publicación trae la lista completa', () => {
    const state = useProblemsStore.getState();

    state.apply([
      {
        path: 'a.ts',
        diagnostics: [diagnostic('error'), diagnostic('error')],
        truncated: false,
      },
    ]);
    state.apply([{ path: 'a.ts', diagnostics: [diagnostic('warning')], truncated: false }]);

    expect(useProblemsStore.getState().byPath.get('a.ts')?.diagnostics).toEqual([
      diagnostic('warning'),
    ]);
  });

  it('borra el archivo cuando el servidor publica una lista vacía', () => {
    const state = useProblemsStore.getState();

    state.apply([{ path: 'a.ts', diagnostics: [diagnostic('error')], truncated: false }]);
    state.apply([{ path: 'a.ts', diagnostics: [], truncated: false }]);

    expect(useProblemsStore.getState().byPath.has('a.ts')).toBe(false);
  });

  it('no toca los archivos que no vienen en el lote', () => {
    const state = useProblemsStore.getState();

    state.apply([{ path: 'a.ts', diagnostics: [diagnostic('error')], truncated: false }]);
    state.apply([{ path: 'b.ts', diagnostics: [diagnostic('error')], truncated: false }]);

    expect([...useProblemsStore.getState().byPath.keys()].toSorted()).toEqual(['a.ts', 'b.ts']);
  });

  it('reemplaza el mapa en vez de mutarlo, para que el selector repinte', () => {
    const before = useProblemsStore.getState().byPath;

    useProblemsStore
      .getState()
      .apply([{ path: 'a.ts', diagnostics: [diagnostic('error')], truncated: false }]);

    expect(useProblemsStore.getState().byPath).not.toBe(before);
  });

  it('conserva el aviso de recorte', () => {
    useProblemsStore
      .getState()
      .apply([{ path: 'a.ts', diagnostics: [diagnostic('error')], truncated: true }]);

    expect(useProblemsStore.getState().byPath.get('a.ts')?.truncated).toBe(true);
  });
});

describe('countProblems', () => {
  it('suma errores y advertencias de todos los archivos', () => {
    const byPath = new Map([
      ['a.ts', { diagnostics: [diagnostic('error'), diagnostic('warning')], truncated: false }],
      ['b.ts', { diagnostics: [diagnostic('error')], truncated: false }],
    ]);

    expect(countProblems(byPath)).toEqual({ errors: 2, warnings: 1 });
  });

  it('no cuenta info ni hint: la barra de estado muestra dos números', () => {
    const byPath = new Map([
      ['a.ts', { diagnostics: [diagnostic('info'), diagnostic('hint')], truncated: false }],
    ]);

    expect(countProblems(byPath)).toEqual({ errors: 0, warnings: 0 });
  });

  it('devuelve ceros sin archivos', () => {
    expect(countProblems(new Map())).toEqual({ errors: 0, warnings: 0 });
  });
});
