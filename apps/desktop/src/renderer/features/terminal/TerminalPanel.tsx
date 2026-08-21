import { useEffect } from 'react';

import { t } from '../../i18n/index.js';
import type { TerminalSlot } from '../../stores/terminal-store.js';
import { useTerminalStore } from '../../stores/terminal-store.js';

import { useTerminal } from './use-terminal.js';

/** Una terminal: su instancia de xterm, montada aunque esté oculta. */
function TerminalSurface({
  slot,
  isVisible,
}: {
  slot: TerminalSlot;
  isVisible: boolean;
}): React.JSX.Element {
  const hostRef = useTerminal(slot, isVisible);

  // Se esconde con `hidden` y no desmontando: desmontar tiraría el scrollback
  // de xterm, así que cambiar de terminal y volver perdería todo lo que se
  // había escrito.
  return (
    <div
      ref={hostRef}
      className="terminal-panel__surface"
      hidden={!isVisible}
      data-testid={`terminal-surface-${slot.slotId}`}
    />
  );
}

/**
 * El panel de terminales integradas ([RF-301 a RF-305](../../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)).
 *
 * Se suscribe a `terminal:exit` una sola vez para todo el panel y no una vez
 * por terminal: el evento dice a qué sesión pertenece, y una suscripción por
 * instancia significaría N listeners recibiendo N eventos cada uno.
 *
 * **La tira de terminales ya no vive acá**: desde el rediseño se dibuja al
 * extremo derecho de la barra del panel inferior, que es donde el registro de
 * paneles la enchufa como `Actions`. El panel se quedó con lo que de verdad es
 * suyo: las superficies y el error.
 *
 * Lo que sí conserva es su propia `<section>` con su nombre accesible. No es
 * decoración: es la región que un lector de pantalla anuncia al entrar, y es
 * el ancla de los E2E de la terminal.
 */
export function TerminalPanel(): React.JSX.Element {
  const slots = useTerminalStore((state) => state.slots);
  const activeSlotId = useTerminalStore((state) => state.activeSlotId);
  const error = useTerminalStore((state) => state.error);
  const forget = useTerminalStore((state) => state.forget);

  useEffect(
    () =>
      window.pastecode.subscribe('terminal:exit', (event) => {
        forget(event.sessionId);
      }),
    [forget]
  );

  return (
    <section className="terminal-panel" aria-label={t('terminal.panel')}>
      {error !== null && (
        <p className="terminal-panel__error" role="alert">
          {error.userMessage}
        </p>
      )}

      {slots.map((slot) => (
        <TerminalSurface
          key={slot.slotId}
          slot={slot}
          isVisible={slot.slotId === activeSlotId}
        />
      ))}
    </section>
  );
}
