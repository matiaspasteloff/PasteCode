import { useEffect, useState } from 'react';

import { t } from '../i18n/index.js';
import { useEditorStore } from '../stores/editor-store.js';

import { StatusBranch } from './status/StatusBranch.js';
import { StatusExtensions } from './status/StatusExtensions.js';
import { StatusIndentation } from './status/StatusIndentation.js';
import { StatusKeybindings } from './status/StatusKeybindings.js';
import { StatusLanguage } from './status/StatusLanguage.js';
import { StatusPosition } from './status/StatusPosition.js';
import { StatusProblems } from './status/StatusProblems.js';

/** Umbral de RNF-24: por debajo de esto, avisar molesta más que informar. */
const PROGRESS_DELAY_MS = 500;

/**
 * Barra de estado: la marca y el progreso a la izquierda, los indicadores del
 * archivo activo a la derecha.
 *
 * Desde el paso 26½ es **un contenedor y no un componente con contenido**. Cada
 * indicador se suscribe a lo suyo, que es lo que hace que mover el cursor
 * repinte doce caracteres en vez de la barra entera: `Ln, Col` cambia con cada
 * tecla, y un solo componente leyendo todo dejaría el presupuesto de 16ms de
 * RNF-02 en dibujar cosas que no cambiaron.
 *
 * La rama y los problemas son dos componentes más de la lista de abajo, cada
 * uno suscripto a su propio store: eso es lo que hace que un refresco de Git no
 * repinte el contador de la línea y la columna.
 *
 * La versión no está hardcodeada. Llega por el canal `app:getVersion`, así que
 * verla en pantalla sigue siendo la prueba visible de que la cadena contrato →
 * main → preload → renderer funciona de punta a punta.
 */
export function StatusBar(): React.JSX.Element {
  const version = useAppVersion();
  const isSaving = useEditorStore((state) => state.isSaving);
  const showProgress = useDelayed(isSaving, PROGRESS_DELAY_MS);

  return (
    <footer className="status-bar">
      <div className="status-bar__group">
        <span className="app__name">PasteCode</span>

        {showProgress && (
          <span className="status-bar__saving" data-testid="saving-indicator">
            {t('editor.saving')}
          </span>
        )}
      </div>

      <div className="status-bar__group">
        <StatusExtensions />
        <StatusKeybindings />
        <StatusBranch />
        <StatusProblems />
        <StatusPosition />
        <StatusIndentation />
        <StatusLanguage />

        <span className="status-bar__version" data-testid="app-version">
          {version}
        </span>
      </div>
    </footer>
  );
}

/** La versión de la app, o un guion si el canal falló. */
function useAppVersion(): string {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    // useEffect es correcto acá: es una llamada IPC asíncrona, no estado
    // derivado. Lo que codigo.md prohíbe es lo segundo.
    window.pastecode
      .invoke('app:getVersion', {})
      .then((result) => {
        setVersion(result.ok ? result.value.version : '—');
      })
      .catch(() => {
        // Un rechazo de la promesa ya no es "el handler falló" —eso viaja como
        // `ok: false`—, sino que el IPC mismo se rompió. Ver ADR-0011.
        setVersion('—');
      });
  }, []);

  return version;
}

/**
 * Devuelve `true` recién cuando `active` lleva `delayMs` encendido.
 *
 * [RNF-24](../../../../../docs/04-requerimientos-no-funcionales.md#usabilidad-y-accesibilidad)
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
