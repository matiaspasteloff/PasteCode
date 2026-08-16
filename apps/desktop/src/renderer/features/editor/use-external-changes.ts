import { useEffect } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useFileTreeStore } from '../../stores/file-tree-store.js';

/**
 * Escucha `files:changed` y reacciona a lo que cambió en el disco (RF-004).
 *
 * Va en el cascarón y no en el editor: cuando no hay ninguna pestaña abierta el
 * editor está desmontado, y el árbol tiene que refrescarse igual.
 *
 * Un lote con `isBulk` no trae la lista **a propósito**: a partir de unos pocos
 * cientos de archivos —un `git checkout`, un `pnpm install`— procesarlos uno
 * por uno en el hilo de UI rompe el presupuesto de 50ms de RNF-06, y la lista
 * tampoco le sirve a nadie. Ahí se revalida en bloque.
 *
 * @example
 * useExternalChanges(); // una vez, en el cascarón de la app
 */
export function useExternalChanges(): void {
  useEffect(
    () =>
      window.pastecode.subscribe('files:changed', (event) => {
        const { applyExternalChanges } = useEditorStore.getState();

        if (event.isBulk) {
          void useFileTreeStore.getState().refresh();
          return;
        }

        void applyExternalChanges(event.changes);
        // El árbol se entera de las altas y las bajas; las modificaciones no
        // cambian lo que muestra.
        if (event.changes.some((change) => change.kind !== 'modified')) {
          void useFileTreeStore.getState().refresh();
        }
      }),
    []
  );
}
