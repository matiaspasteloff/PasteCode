import { activeTab } from '@pastecode/core';
import { useEffect } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useGitStore } from '../../stores/git-store.js';

import { clearGutter, refreshGutter } from './gutter.js';

/**
 * Mantiene el gutter al día ([RF-605](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Dos disparadores y nada más:
 *
 * - **La pestaña activa cambió.** Hay que pedir el diff del archivo nuevo.
 * - **`git:changed` llegó.** Ese evento ya cubre los tres casos que importan
 *   —guardar, el watcher y stage/unstage/commit— y **ya viene con el debounce
 *   de 150ms del main**, así que no hace falta un segundo debounce acá.
 *
 * Lo que no está en la lista es tipear. El diff cuesta un proceso, y pedirlo
 * por tecla es exactamente lo que el presupuesto de RNF-02 no aguanta. La
 * consecuencia aceptada es que las marcas quedan viejas mientras se escribe y
 * se corrigen al guardar, que es lo que hacen todos los editores.
 *
 * @example
 * useGutter(); // una vez, en el cascarón de la app
 */
export function useGutter(): void {
  const activePath = useEditorStore((state) => activeTab(state.tabs)?.path ?? null);
  const repository = useGitStore((state) => state.repository);

  useEffect(() => {
    if (repository === null) {
      clearGutter();
      return;
    }

    void refreshGutter(activePath);
  }, [activePath, repository]);
}
