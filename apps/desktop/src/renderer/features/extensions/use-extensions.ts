import { activeTab, activeTabs } from '@pastecode/core';
import { useEffect } from 'react';

import { useEditorStatusStore } from '../../stores/editor-status-store.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useExtensionsStore } from '../../stores/extensions-store.js';
import { applyExtensionEdits, contentOf, versionOf } from '../editor/model-registry.js';

import { syncCommands } from './sync-commands.js';

/**
 * Enchufa las extensiones al renderer.
 *
 * Son cuatro cables y ninguno es opcional:
 *
 * 1. **El estado del host y la lista**, para poder mostrarlos.
 * 2. **Las contribuciones**: los comandos van al `CommandRegistry` de fábrica y
 *    los ítems al store de la barra.
 * 3. **El pull del documento activo**: el main pregunta por evento y esta
 *    ventana contesta por canal. Es la mitad del renderer de ADR-0026.
 * 4. **El aviso de qué está activo**, sin el texto: si el aviso arrastrara el
 *    contenido, cada tecla serían dos saltos de proceso con el archivo entero.
 *
 * @example
 * useExtensions(); // una vez, en el cascarón de la app
 */
export function useExtensions(): void {
  useHostEvents();
  useContributions();
  useDocumentBroker();
  useActiveEditorReporting();
}

/** Cable 1: estado del host y lista de extensiones. */
function useHostEvents(): void {
  const setHost = useExtensionsStore((state) => state.setHost);
  const setExtensions = useExtensionsStore((state) => state.setExtensions);
  const setThemes = useExtensionsStore((state) => state.setThemes);

  useEffect(() => {
    const stopHost = window.pastecode.subscribe('extensions:hostChanged', setHost);
    const stopList = window.pastecode.subscribe('extensions:changed', (payload) => {
      setExtensions(payload.extensions);
      setThemes(payload.themes);
    });

    // El estado inicial se pregunta: la ventana puede haber montado después de
    // que el host ya arrancó, y entonces el evento que lo anunciaba ya pasó.
    void window.pastecode.invoke('extensions:getStatus', {}).then((result) => {
      if (result.ok) setHost(result.value);
    });
    void window.pastecode.invoke('extensions:list', {}).then((result) => {
      if (!result.ok) return;

      setExtensions(result.value.extensions);
      setThemes(result.value.themes);
    });

    return () => {
      stopHost();
      stopList();
    };
  }, [setHost, setExtensions, setThemes]);
}

/** Cable 2: comandos al registro de fábrica, ítems al store de la barra. */
function useContributions(): void {
  const setStatusItems = useExtensionsStore((state) => state.setStatusItems);

  useEffect(
    () =>
      window.pastecode.subscribe('extensions:contributionsChanged', (payload) => {
        syncCommands(payload.commands);
        setStatusItems(payload.statusItems);
      }),
    [setStatusItems]
  );
}

/** Cable 3: contestar lo que el main pregunta sobre el documento activo. */
function useDocumentBroker(): void {
  useEffect(
    () =>
      window.pastecode.subscribe('extensions:documentRequest', (request) => {
        const answer =
          request.kind === 'read'
            ? { text: contentOf(request.path) ?? null }
            : {
                text: null,
                applied: applyExtensionEdits(
                  request.path,
                  request.version ?? -1,
                  request.edits ?? []
                ),
              };

        void window.pastecode.invoke('extensions:documentResponse', {
          requestId: request.requestId,
          ...answer,
        });
      }),
    []
  );
}

/** Cable 4: avisar qué documento está activo, con su versión y sin su texto. */
function useActiveEditorReporting(): void {
  const groups = useEditorStore((state) => state.groups);
  const path = activeTab(activeTabs(groups))?.path;
  // El lenguaje lo resuelve Monaco y ya está en el store de la barra: volver a
  // deducirlo de la extensión del archivo sería una segunda respuesta a la
  // misma pregunta, y las dos se desincronizarían en cuanto alguien cambie el
  // lenguaje de una pestaña a mano.
  const languageId = useEditorStatusStore((state) => state.languageId);

  useEffect(() => {
    const editor =
      path === undefined
        ? null
        : {
            path,
            languageId: languageId ?? 'plaintext',
            // Si el modelo todavía no existe, la versión es 1: es lo que Monaco
            // le da a un modelo recién creado, así que la primera edición de una
            // extensión no falla por una versión inventada.
            version: versionOf(path) ?? 1,
          };

    void window.pastecode.invoke('extensions:activeEditorChanged', { editor });
  }, [path, languageId]);
}
