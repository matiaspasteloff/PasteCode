import { t } from '../../i18n/index.js';
import { useSearchStore } from '../../stores/search-store.js';

import { SearchOptions } from './SearchOptions.js';

/**
 * El formulario de búsqueda: consulta, globs de inclusión y las opciones.
 *
 * Está separado del panel porque son dos cosas con ritmos distintos: esto se
 * repinta con cada tecla y la lista de resultados con cada lote que llega.
 * Separarlos evita que tipear vuelva a dibujar mil filas.
 */
export function SearchForm(): React.JSX.Element {
  const query = useSearchStore((state) => state.query);
  const includeGlobs = useSearchStore((state) => state.includeGlobs);
  const setQuery = useSearchStore((state) => state.setQuery);
  const setIncludeGlobs = useSearchStore((state) => state.setIncludeGlobs);

  return (
    <>
      <input
        type="search"
        className="search-panel__query"
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <input
        type="text"
        className="search-panel__globs"
        placeholder={t('search.includePlaceholder')}
        aria-label={t('search.includePlaceholder')}
        value={includeGlobs}
        onChange={(event) => {
          setIncludeGlobs(event.target.value);
        }}
      />

      <SearchOptions />
    </>
  );
}
