import { useEffect } from 'react';

import { t } from '../../i18n/index.js';
import { useSearchStore } from '../../stores/search-store.js';

import { SearchForm } from './SearchForm.js';
import { SearchResults } from './SearchResults.js';

/** Cuánto se espera después de la última tecla antes de buscar. */
const TYPING_DEBOUNCE_MS = 250;

/**
 * Panel de búsqueda en workspace ([RF-201 a RF-203](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)).
 *
 * Sólo el cascarón: el formulario y la lista son componentes aparte porque se
 * repintan con ritmos distintos —uno con cada tecla, la otra con cada lote de
 * resultados— y juntarlos haría que tipear vuelva a dibujar mil filas.
 */
export function SearchPanel(): React.JSX.Element {
  const query = useSearchStore((state) => state.query);
  const includeGlobs = useSearchStore((state) => state.includeGlobs);
  const matchCount = useSearchStore((state) => state.matchCount);
  const isSearching = useSearchStore((state) => state.isSearching);
  const isTruncated = useSearchStore((state) => state.isTruncated);
  const error = useSearchStore((state) => state.error);
  const run = useSearchStore((state) => state.run);

  useEffect(() => {
    // Se busca al dejar de tipear y no en cada tecla: cada búsqueda lanza un
    // proceso, y lanzar y matar uno por letra cuesta más que esperar un cuarto
    // de segundo.
    const timer = setTimeout(() => {
      void run();
    }, TYPING_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query, includeGlobs, run]);

  return (
    <section className="search-panel" aria-label={t('search.panel')}>
      <SearchForm />

      <p className="search-panel__status" role="status">
        {statusText({ isSearching, matchCount, isTruncated, hasQuery: query !== '' })}
      </p>

      {error !== null && (
        <p className="search-panel__error" role="alert">
          {error.userMessage}
        </p>
      )}

      <SearchResults />
    </section>
  );
}

/** El texto de estado. Es el feedback de progreso que pide RNF-24. */
function statusText(state: {
  isSearching: boolean;
  matchCount: number;
  isTruncated: boolean;
  hasQuery: boolean;
}): string {
  if (state.isSearching) return t('search.searching');
  if (!state.hasQuery) return '';
  if (state.matchCount === 0) return t('search.empty');

  const count = `${String(state.matchCount)} ${t('search.results')}`;

  return state.isTruncated ? `${count} ${t('search.truncated')}` : count;
}
