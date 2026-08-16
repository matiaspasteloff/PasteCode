import type { SearchMatch } from '@pastecode/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useSearchStore } from './search-store.js';

/** Un match cualquiera. */
function match(path: string, line = 1): SearchMatch {
  return { path, line, column: 1, preview: 'const x = 1;', matchLength: 3 };
}

/** El id de la búsqueda que el store acaba de lanzar. */
function currentId(): string {
  const invoke = installedInvoke;
  const call = invoke.mock.calls.find(([channel]) => channel === 'search:start');
  const payload: unknown = call?.[1];

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('searchId' in payload) ||
    typeof payload.searchId !== 'string'
  ) {
    throw new Error('El store nunca pidió una búsqueda');
  }

  return payload.searchId;
}

let installedInvoke: ReturnType<typeof installFakeApi>;

beforeEach(() => {
  installedInvoke = installFakeApi({
    'search:start': { ok: true, value: {} },
    'search:cancel': { ok: true, value: {} },
  });

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
    isPanelOpen: false,
    error: null,
  });
});

describe('useSearchStore', () => {
  it('no busca con la consulta vacía', async () => {
    await useSearchStore.getState().run();

    expect(installedInvoke).not.toHaveBeenCalled();
    expect(useSearchStore.getState().isSearching).toBe(false);
  });

  it('separa los globs por coma o por espacio', async () => {
    useSearchStore.setState({ query: 'foo', includeGlobs: 'src/**, test/**  docs/**' });

    await useSearchStore.getState().run();

    expect(installedInvoke).toHaveBeenCalledWith(
      'search:start',
      expect.objectContaining({ includeGlobs: ['src/**', 'test/**', 'docs/**'] })
    );
  });

  it('agrupa los matches por archivo', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();

    useSearchStore
      .getState()
      .addMatches(currentId(), [match('a.ts', 1), match('b.ts', 4), match('a.ts', 9)]);

    // RF-202: agrupados por archivo, en el orden en que llegaron.
    const { groups } = useSearchStore.getState();
    expect(groups.map((group) => group.path)).toEqual(['a.ts', 'b.ts']);
    expect(groups[0]?.matches).toHaveLength(2);
    expect(useSearchStore.getState().matchCount).toBe(3);
  });

  it('acumula los lotes que van llegando', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();

    const id = currentId();
    useSearchStore.getState().addMatches(id, [match('a.ts', 1)]);
    useSearchStore.getState().addMatches(id, [match('a.ts', 2)]);

    expect(useSearchStore.getState().groups[0]?.matches).toHaveLength(2);
  });

  it('descarta los resultados de una búsqueda que ya no es la actual', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();

    // Entre que se cancela una búsqueda y que ripgrep muere, sigue escribiendo.
    useSearchStore.getState().addMatches('search-viejo', [match('a.ts')]);

    expect(useSearchStore.getState().groups).toHaveLength(0);
  });

  it('descarta el done de una búsqueda que ya no es la actual', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();

    useSearchStore.getState().finish('search-viejo', false, null);

    // Si no se descartara, la búsqueda en curso se marcaría como terminada.
    expect(useSearchStore.getState().isSearching).toBe(true);
  });

  it('marca el final y si se cortó por el tope', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();

    useSearchStore.getState().finish(currentId(), true, null);

    expect(useSearchStore.getState().isSearching).toBe(false);
    expect(useSearchStore.getState().isTruncated).toBe(true);
  });

  it('vacía los resultados al empezar otra búsqueda', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();
    useSearchStore.getState().addMatches(currentId(), [match('a.ts')]);

    useSearchStore.setState({ query: 'bar' });
    await useSearchStore.getState().run();

    expect(useSearchStore.getState().groups).toHaveLength(0);
  });

  it('borrar la consulta deja de buscar y limpia', async () => {
    useSearchStore.setState({ query: 'foo' });
    await useSearchStore.getState().run();
    useSearchStore.getState().addMatches(currentId(), [match('a.ts')]);

    useSearchStore.setState({ query: '' });
    await useSearchStore.getState().run();

    expect(useSearchStore.getState().groups).toHaveLength(0);
    expect(useSearchStore.getState().isSearching).toBe(false);
  });

  it('guarda el error del main', async () => {
    installedInvoke = installFakeApi({
      'search:start': {
        ok: false,
        error: { code: 'SEARCH_UNAVAILABLE', userMessage: 'No se pudo iniciar la búsqueda.' },
      },
    });
    useSearchStore.setState({ query: 'foo' });

    await useSearchStore.getState().run();

    expect(useSearchStore.getState().error?.code).toBe('SEARCH_UNAVAILABLE');
    expect(useSearchStore.getState().isSearching).toBe(false);
  });

  it('alterna el panel', () => {
    useSearchStore.getState().togglePanel();
    expect(useSearchStore.getState().isPanelOpen).toBe(true);

    useSearchStore.getState().togglePanel();
    expect(useSearchStore.getState().isPanelOpen).toBe(false);
  });
});
