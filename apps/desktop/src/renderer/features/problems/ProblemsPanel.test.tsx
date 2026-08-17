import type { Diagnostic } from '@pastecode/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useLspStatusStore } from '../../stores/lsp-status-store.js';
import type { FileProblems } from '../../stores/problems-store.js';
import { useProblemsStore } from '../../stores/problems-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { resetEditorStore } from '../../test-support/editor-state.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { ProblemsPanel } from './ProblemsPanel.js';

const ROOT = 'C:/proyecto';

/** Un diagnóstico en la línea y columna que el caso necesite. */
function diagnostic(message: string, line = 1, column = 1): Diagnostic {
  return {
    range: { start: { line, column }, end: { line, column: column + 3 } },
    severity: 'error',
    message,
    source: 'ts',
    code: '2304',
  };
}

/** Los problemas de un archivo, listos para el store. */
function problems(diagnostics: readonly Diagnostic[], truncated = false): FileProblems {
  return { diagnostics, truncated };
}

let invoke: ReturnType<typeof installFakeApi>;

beforeEach(() => {
  invoke = installFakeApi({
    'fs:readFile': { ok: true, value: { content: '', mtimeMs: 0 } },
  });

  useProblemsStore.setState({ byPath: new Map<string, FileProblems>() });
  useLspStatusStore.setState({ servers: {} });
  // El store del editor es de módulo (ADR-0004): una pestaña que dejó abierta
  // otro test haría que `open` no relea el archivo.
  resetEditorStore();
  useWorkspaceStore.setState({ workspace: { root: ROOT, name: 'proyecto' } });
});

describe('ProblemsPanel', () => {
  it('avisa cuando no hay ningún problema', () => {
    render(<ProblemsPanel />);

    expect(screen.getByText('Ningún problema detectado')).toBeDefined();
  });

  it('agrupa los problemas por archivo, con su conteo', () => {
    useProblemsStore.setState({
      byPath: new Map([
        [`${ROOT}/src/a.ts`, problems([diagnostic('no existe'), diagnostic('tampoco', 3)])],
      ]),
    });

    render(<ProblemsPanel />);

    expect(screen.getByText('a.ts')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getAllByTestId('problem-row')).toHaveLength(2);
  });

  it('marca con un + el archivo cuyos problemas se recortaron', () => {
    useProblemsStore.setState({
      byPath: new Map([[`${ROOT}/src/a.ts`, problems([diagnostic('uno')], true)]]),
    });

    render(<ProblemsPanel />);

    expect(screen.getByText('1+')).toBeDefined();
  });

  it('ordena los problemas por posición y no por orden de llegada', () => {
    // Una lista que se reordena sola cada vez que llega un lote es imposible de
    // clickear.
    useProblemsStore.setState({
      byPath: new Map([
        [
          `${ROOT}/src/a.ts`,
          problems([diagnostic('el de abajo', 9), diagnostic('el de arriba', 2)]),
        ],
      ]),
    });

    render(<ProblemsPanel />);

    expect(screen.getAllByTestId('problem-row').map((row) => row.textContent)).toEqual([
      'el de arriba2',
      'el de abajo9',
    ]);
  });

  it('ordena los archivos por ruta', () => {
    useProblemsStore.setState({
      byPath: new Map([
        [`${ROOT}/src/z.ts`, problems([diagnostic('uno')])],
        [`${ROOT}/src/a.ts`, problems([diagnostic('otro')])],
      ]),
    });

    render(<ProblemsPanel />);

    const names = screen.getAllByText(/^[az]\.ts$/).map((element) => element.textContent);

    expect(names).toEqual(['a.ts', 'z.ts']);
  });

  it('abre el archivo del problema al clickearlo', async () => {
    useProblemsStore.setState({
      byPath: new Map([[`${ROOT}/src/a.ts`, problems([diagnostic('no existe', 42)])]]),
    });

    render(<ProblemsPanel />);
    await userEvent.click(screen.getByTestId('problem-row'));

    expect(invoke).toHaveBeenCalledWith('fs:readFile', { path: `${ROOT}/src/a.ts` });
  });
});

describe('los servidores caídos', () => {
  it('cuenta cuál falló, con el motivo que dio', () => {
    // La diferencia entre "este proyecto no tiene errores" y "no hay quien los
    // busque" es demasiado grande como para dejarla en un panel vacío.
    useLspStatusStore.setState({
      servers: {
        ts: { serverId: 'ts', state: 'failed', userMessage: 'no se encontró tsserver' },
      },
    });

    render(<ProblemsPanel />);

    expect(screen.getByRole('alert').textContent).toBe('no se encontró tsserver');
  });

  it('cae a un mensaje genérico cuando el servidor no dio motivo', () => {
    useLspStatusStore.setState({
      servers: { ts: { serverId: 'ts', state: 'failed', userMessage: null } },
    });

    render(<ProblemsPanel />);

    expect(screen.getByRole('alert').textContent).toBe(
      'El servidor de lenguaje no está disponible'
    );
  });

  it('no dice nada de los servidores que andan', () => {
    useLspStatusStore.setState({
      servers: { ts: { serverId: 'ts', state: 'running', userMessage: null } },
    });

    render(<ProblemsPanel />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
