import { useEffect } from 'react';

import { useAiStore } from '../../stores/ai-store.js';

/**
 * Engancha los tres eventos del asistente y consulta el estado de la clave.
 *
 * Una suscripción por evento y una sola para todo el panel, no una por
 * mensaje: es el mismo criterio que `TerminalPanel` con `terminal:exit`. El
 * payload dice a qué pregunta pertenece, y suscribirse por mensaje sería N
 * listeners recibiendo N eventos cada uno.
 *
 * Vive en el cascarón y no adentro del panel **a propósito**: los eventos
 * siguen llegando con la vista lateral colapsada, y desmontar el listener al
 * cerrar el panel perdería la respuesta que se está escribiendo.
 *
 * @example
 * useAiEvents(); // una vez, en el cascarón de la app
 */
export function useAiEvents(): void {
  const appendDelta = useAiStore((state) => state.appendDelta);
  const addPending = useAiStore((state) => state.addPending);
  const finish = useAiStore((state) => state.finish);
  const refreshKeyStatus = useAiStore((state) => state.refreshKeyStatus);

  useEffect(() => {
    // Sin clave el asistente no hace una sola llamada de red, pero la UI
    // igual tiene que saberlo para ofrecer configurarla en vez de un panel
    // que no responde.
    void refreshKeyStatus();
  }, [refreshKeyStatus]);

  useEffect(
    () =>
      window.pastecode.subscribe('ai:delta', (event) => {
        appendDelta(event.requestId, event.text);
      }),
    [appendDelta]
  );

  useEffect(
    () =>
      window.pastecode.subscribe('ai:toolCall', (event) => {
        addPending(event);
      }),
    [addPending]
  );

  useEffect(
    () =>
      window.pastecode.subscribe('ai:done', (event) => {
        finish(event.requestId, event.error);
      }),
    [finish]
  );
}
