import type { SearchMatch } from '@pastecode/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SearchGroup } from '../../stores/search-store.js';
import { useSearchStore } from '../../stores/search-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { resetEditorStore } from '../../test-support/editor-state.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { SearchPanel } from './SearchPanel.js';

const ROOT = 'C:/proyecto';

function match(line: number, preview = '  const a = 1;'): SearchMatch {
  return { path: `${ROOT}/src/a.ts`, line, column: 1, preview, matchLength: 5 };
}

function group(path: string, matches: readonly SearchMatch[]): SearchGroup {
  return { path, matches: [...matches] };
}

/** El estado inicial del store, para que un caso no herede al anterior. */
function resetSearch(
  overrides: Partial<ReturnType<typeof useSearchStore.getState>> = {}
): void {
  useSearchStore.setState({
    query: '',
    includeGlobs: '',
    isRegex: false,
    isCaseSensitive: false,
    matchWholeWord: false,
    groups: [],
    matchCount: 0,
    isSearching: false,
    isTruncated: false,
    error: null,
    ...overrides,
  });
}

let invoke: ReturnType<typeof installFakeApi>;

beforeEach(() => {
  invoke = installFakeApi({
    'search:start': { ok: true, value: {} },
    'search:cancel': { ok: true, value: {} },
    'fs:readFile': { ok: true, value: { content: '', mtimeMs: 0 } },
  });

  resetSearch();
  // El store del editor es de módulo y no tiene provider (ADR-0004): sin esto,
  // una pestaña abierta por otro test hace que `open` corte antes de leer el
  // archivo, porque no relee lo que ya está abierto.
  resetEditorStore();
  useWorkspaceStore.setState({ workspace: { root: ROOT, name: 'proyecto' } });
});

describe('SearchPanel', () => {
  it('no dice nada mientras no se buscó nada', () => {
    render(<SearchPanel />);

    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('cuenta que está buscando', () => {
    resetSearch({ query: 'const', isSearching: true });

    render(<SearchPanel />);

    expect(screen.getByRole('status').textContent).toBe('Buscando…');
  });

  it('avisa cuando la consulta no encontró nada', () => {
    resetSearch({ query: 'zzz', matchCount: 0 });

    render(<SearchPanel />);

    expect(screen.getByRole('status').textContent).toBe('Ningún resultado');
  });

  it('cuenta cuántos resultados hay', () => {
    resetSearch({ query: 'const', matchCount: 12 });

    render(<SearchPanel />);

    expect(screen.getByRole('status').textContent).toBe('12 resultados');
  });

  it('aclara cuando la lista quedó recortada', () => {
    resetSearch({ query: 'const', matchCount: 500, isTruncated: true });

    render(<SearchPanel />);

    expect(screen.getByRole('status').textContent).toBe(
      '500 resultados (se muestran los primeros)'
    );
  });

  it('muestra el error de la búsqueda', () => {
    resetSearch({
      query: 'const',
      error: { code: 'SEARCH_FAILED', userMessage: 'el patrón no es válido' },
    });

    render(<SearchPanel />);

    expect(screen.getByRole('alert').textContent).toBe('el patrón no es válido');
  });

  it('espera a que se deje de tipear antes de buscar', async () => {
    render(<SearchPanel />);

    useSearchStore.setState({ query: 'const' });

    // Lanzar y matar un proceso por letra cuesta más que esperar un cuarto de
    // segundo, así que la búsqueda sale del debounce y no del onChange.
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('search:start', expect.anything());
    });
  });
});

describe('SearchResults', () => {
  it('agrupa los matches por archivo, con su conteo', () => {
    resetSearch({
      query: 'const',
      matchCount: 2,
      groups: [group(`${ROOT}/src/a.ts`, [match(1), match(7)])],
    });

    render(<SearchPanel />);

    expect(screen.getByText('a.ts')).toBeDefined();
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('recorta el espacio del preview para que la fila no quede vacía a la izquierda', () => {
    resetSearch({
      query: 'const',
      matchCount: 1,
      groups: [group(`${ROOT}/src/a.ts`, [match(3, '      const a = 1;')])],
    });

    render(<SearchPanel />);

    expect(screen.getByText('const a = 1;')).toBeDefined();
  });

  it('abre el archivo del match al clickearlo', async () => {
    resetSearch({
      query: 'const',
      matchCount: 1,
      groups: [group(`${ROOT}/src/a.ts`, [match(42)])],
    });

    render(<SearchPanel />);
    await userEvent.click(screen.getByText('const a = 1;'));

    // `waitFor` y no un assert pelado: abrir el archivo es asincrónico y
    // `userEvent.click` sólo garantiza que React haya pintado, no que la
    // cadena de promesas que sale del click haya llegado hasta el IPC. Sin
    // esto el test pasaba casi siempre y fallaba una de cada tres corridas
    // completas, que es la peor forma de fallar.
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('fs:readFile', { path: `${ROOT}/src/a.ts` });
    });
  });
});
