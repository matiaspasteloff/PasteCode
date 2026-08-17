import { useEffect } from 'react';

import { useGitStore } from '../../stores/git-store.js';

/**
 * Conecta los eventos de Git con el store.
 *
 * Se suscribe una sola vez para toda la app y **fuera del panel**: si viviera
 * adentro, cerrar la vista de Git dejaría de actualizar el indicador de rama de
 * la barra de estado y las marcas del árbol, que siguen visibles. Es la misma
 * razón que la de `useSearchEvents`.
 *
 * @example
 * useGitEvents(); // una vez, en el cascarón de la app
 */
export function useGitEvents(): void {
  const setRepository = useGitStore((state) => state.setRepository);
  const refresh = useGitStore((state) => state.refresh);

  useEffect(
    () =>
      window.pastecode.subscribe('git:changed', (event) => {
        setRepository(event.repository);
      }),
    [setRepository]
  );

  useEffect(() => {
    // El snapshot al montar: el main puede tener un workspace abierto de antes
    // de que la ventana recargara, y ahí no hay ningún hecho nuevo que contar.
    void refresh();
  }, [refresh]);
}
