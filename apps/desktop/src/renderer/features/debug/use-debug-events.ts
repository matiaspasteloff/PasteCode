import { useEffect } from 'react';

import { useDebugStore } from '../../stores/debug-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';

/**
 * Mantiene el estado del debugging al día con lo que pasa en el main.
 *
 * Tres eventos y dos consultas iniciales. Las consultas hacen falta porque la
 * ventana puede montar después de que el estado ya sea el que es: sin ellas, un
 * `launch.json` que existía desde antes no aparecería hasta que algo lo
 * cambiara.
 *
 * @example
 * useDebugEvents(); // una vez, en el cascarón de la app
 */
export function useDebugEvents(): void {
  const workspace = useWorkspaceStore((state) => state.workspace);

  useEffect(() => {
    const store = useDebugStore.getState();

    const stopStopped = window.pastecode.subscribe('debug:stopped', (event) => {
      void store.onStopped(event);
    });
    const stopOutput = window.pastecode.subscribe('debug:output', (event) => {
      store.appendConsole(event);
    });
    const stopTerminated = window.pastecode.subscribe('debug:terminated', (status) => {
      store.onTerminated(status);
    });

    return () => {
      stopStopped();
      stopOutput();
      stopTerminated();
    };
  }, []);

  useEffect(() => {
    const store = useDebugStore.getState();

    void window.pastecode.invoke('debug:getStatus', {}).then((result) => {
      if (result.ok) store.setStatus(result.value);
    });

    // Sin workspace no hay `launch.json` que leer, y pedirlo lanzaría del lado
    // del main por no haber raíz.
    if (workspace === null) return;

    void window.pastecode.invoke('debug:getConfigurations', {}).then((result) => {
      if (result.ok) store.setConfigurations(result.value);
    });
  }, [workspace]);
}
