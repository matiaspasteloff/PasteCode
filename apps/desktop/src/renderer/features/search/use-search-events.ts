import { useEffect } from 'react';

import { useSearchStore } from '../../stores/search-store.js';

/**
 * Conecta los eventos de búsqueda con el store.
 *
 * Se suscribe una sola vez para todo el panel, y **fuera del componente del
 * panel**: si viviera adentro, esconder la búsqueda desmontaría el listener y
 * los resultados de una búsqueda en curso se perderían en vez de terminar de
 * llegar.
 *
 * @example
 * useSearchEvents(); // una vez, en el cascarón de la app
 */
export function useSearchEvents(): void {
  const addMatches = useSearchStore((state) => state.addMatches);
  const finish = useSearchStore((state) => state.finish);

  useEffect(
    () =>
      window.pastecode.subscribe('search:result', (event) => {
        addMatches(event.searchId, event.matches);
      }),
    [addMatches]
  );

  useEffect(
    () =>
      window.pastecode.subscribe('search:done', (event) => {
        finish(event.searchId, event.truncated, event.error);
      }),
    [finish]
  );
}
