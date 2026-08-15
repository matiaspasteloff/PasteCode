import { useEffect, useState } from 'react';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

/** Umbral de RNF-24: por debajo de esto, avisar molesta más que informar. */
const PROGRESS_DELAY_MS = 500;

/**
 * Barra del archivo abierto: nombre, punto de cambios sin guardar y progreso.
 *
 * Es la semilla de la tira de pestañas del paso 16. El `data-testid` del punto
 * ya es el que espera el ejemplo de
 * [testing.md](../../../../../../docs/convenciones/testing.md#e2e), así que ese
 * test no va a haber que reescribirlo cuando aparezcan las pestañas.
 */
export function OpenFileBar(): React.JSX.Element | null {
  const file = useEditorStore((state) => state.file);
  const isDirty = useEditorStore((state) => state.isDirty);
  const isSaving = useEditorStore((state) => state.isSaving);
  const showProgress = useDelayed(isSaving, PROGRESS_DELAY_MS);

  if (file === null) return null;

  return (
    <div className="open-file">
      <span className="open-file__name">{file.path.split(/[\\/]/).at(-1)}</span>

      {isDirty && (
        <span
          className="open-file__dirty"
          data-testid="tab-dirty-indicator"
          aria-label={t('editor.dirty')}
        >
          ●
        </span>
      )}

      {showProgress && <span className="open-file__saving">{t('editor.saving')}</span>}
    </div>
  );
}

/**
 * Devuelve `true` recién cuando `active` lleva `delayMs` encendido.
 *
 * [RNF-24](../../../../../../docs/04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad)
 * pide feedback para lo que pasa de 500ms, y sólo para eso: un "Guardando…"
 * que aparece y desaparece en 20ms es un parpadeo que da sensación de lentitud
 * justo cuando la operación fue rápida.
 */
function useDelayed(active: boolean, delayMs: number): boolean {
  const [isElapsed, setIsElapsed] = useState(false);

  useEffect(() => {
    if (!active) {
      setIsElapsed(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setIsElapsed(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [active, delayMs]);

  return isElapsed;
}
