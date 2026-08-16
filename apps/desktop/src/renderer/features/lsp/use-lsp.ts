import { useEffect } from 'react';

import { useLspStatusStore } from '../../stores/lsp-status-store.js';
import { useProblemsStore } from '../../stores/problems-store.js';
import { whenMonacoLoaded } from '../editor/monaco-instance.js';

import { closeLspDocument, openLspDocument, reopenAllDocuments } from './document-sync.js';
import { applyMarkers } from './markers.js';
import { registerLspProviders } from './providers.js';

/**
 * Conecta el LSP con la aplicación: documentos, diagnósticos y estado.
 *
 * Va en el cascarón y no en un componente del editor, por lo mismo que
 * `useSearchEvents`: si viviera adentro del editor, quedarse sin pestañas
 * desmontaría el listener y los diagnósticos de los archivos que nadie abrió
 * —que son la mitad del valor del panel de problemas— dejarían de llegar.
 *
 * @example
 * useLsp(); // una vez, en App
 */
export function useLsp(): void {
  const applyDiagnostics = useProblemsStore((state) => state.apply);
  const applyStatus = useLspStatusStore((state) => state.apply);
  const replaceStatuses = useLspStatusStore((state) => state.replaceAll);

  useModelLifecycle();

  useEffect(
    () =>
      window.pastecode.subscribe('lsp:diagnostics', (event) => {
        applyDiagnostics(event.documents);

        // Los marcadores se pintan acá y no en un efecto del store: `useEffect`
        // para derivar estado es lo que prohíbe la regla 5 de codigo.md, y esto
        // no es estado derivado sino un efecto de verdad sobre Monaco.
        for (const document of event.documents) {
          applyMarkers(document.path, document.diagnostics);
        }
      }),
    [applyDiagnostics]
  );

  useEffect(
    () =>
      window.pastecode.subscribe('lsp:serverChanged', (event) => {
        applyStatus(event.server);

        // Volver a `running` es un servidor recién reiniciado, que no sabe nada
        // de lo que había abierto.
        if (event.server.state === 'running') void reopenAllDocuments();
      }),
    [applyStatus]
  );

  useEffect(() => {
    // El snapshot al montar: los servidores siguen vivos cuando la ventana
    // recarga, así que no hay ningún hecho nuevo que contar y sin esto el
    // renderer creería que no hay ninguno.
    window.pastecode
      .invoke('lsp:status', {})
      .then((result) => {
        if (result.ok) replaceStatuses(result.value.servers);
      })
      .catch(() => undefined);
  }, [replaceStatuses]);
}

/**
 * Abre y cierra documentos siguiendo el ciclo de vida de los **modelos**.
 *
 * Es la costura correcta y no la lista de pestañas: un modelo existe
 * exactamente mientras el archivo está abierto de verdad —lo crea el registro
 * al leer el disco y lo desecha `releaseModelsExcept` al cerrar la pestaña—,
 * así que colgarse de ahí no puede desincronizarse con lo que el usuario ve.
 */
function useModelLifecycle(): void {
  useEffect(() => {
    let disposeSubscriptions: (() => void) | null = null;

    const stopWaiting = whenMonacoLoaded((monaco) => {
      const created = monaco.editor.onDidCreateModel((model) => {
        void openLspDocument(model);
      });
      const disposing = monaco.editor.onWillDisposeModel((model) => {
        void closeLspDocument(model);
      });
      const providers = registerLspProviders(monaco);

      disposeSubscriptions = () => {
        created.dispose();
        disposing.dispose();
        for (const provider of providers) provider.dispose();
      };

      // Los modelos que ya existían cuando esto se montó: en la práctica
      // ninguno, pero un `useLsp` que dependiera de montarse antes que el
      // editor sería una dependencia de orden que nada garantiza.
      for (const model of monaco.editor.getModels()) void openLspDocument(model);
    });

    return () => {
      stopWaiting();
      disposeSubscriptions?.();
    };
  }, []);
}
