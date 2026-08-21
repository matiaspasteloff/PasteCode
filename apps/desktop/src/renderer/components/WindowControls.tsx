import { useEffect, useState } from 'react';

import { t } from '../i18n/index.js';

/**
 * Los glifos de los botones de ventana, en Segoe Fluent Icons / Segoe MDL2.
 *
 * Son **caracteres** de la fuente de iconos que Windows trae de fábrica y no
 * SVGs propios: son exactamente los mismos que dibuja el marco nativo, así que
 * la barra propia no se ve "casi igual" sino igual. En un sistema sin esa
 * fuente el fallback de `.window-controls` los reemplaza por los símbolos
 * Unicode equivalentes, que es lo mejor disponible.
 */
const GLYPHS = {
  minimize: '',
  maximize: '',
  restore: '',
  close: '',
} as const;

/**
 * Los tres botones de ventana de la barra de título.
 *
 * El de maximizar **cambia de glifo con el estado**, y ese estado no se puede
 * simplemente preguntar una vez: arrastrar la ventana al borde superior la
 * maximiza sin que nadie apriete nada. De ahí el par pregunta/evento
 * (`window:isMaximized` + `window:maximizedChanged`), que es el mismo par de
 * `git:getStatus` / `git:changed`.
 *
 * Cada botón lleva `no-drag` por el CSS de `.title-toolbar *`, que es la regla
 * que evita el error clásico de esta feature: un control adentro de una región
 * de arrastre no recibe clicks (ADR-0030).
 */
export function WindowControls(): React.JSX.Element {
  const isMaximized = useMaximizedState();

  return (
    <div className="window-controls">
      <button
        type="button"
        aria-label={t('window.minimize')}
        title={t('window.minimize')}
        data-testid="window-minimize"
        onClick={() => {
          void window.pastecode.invoke('window:minimize', {});
        }}
      >
        {GLYPHS.minimize}
      </button>

      <button
        type="button"
        aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
        title={isMaximized ? t('window.restore') : t('window.maximize')}
        data-testid="window-maximize"
        onClick={() => {
          void window.pastecode.invoke('window:toggleMaximize', {});
        }}
      >
        {isMaximized ? GLYPHS.restore : GLYPHS.maximize}
      </button>

      <button
        type="button"
        className="window-controls__close"
        aria-label={t('window.close')}
        title={t('window.close')}
        data-testid="window-close"
        onClick={() => {
          void window.pastecode.invoke('window:close', {});
        }}
      >
        {GLYPHS.close}
      </button>
    </div>
  );
}

/**
 * Si la ventana está maximizada, preguntando al montar y escuchando después.
 *
 * Las dos mitades hacen falta y ninguna alcanza sola: al montar no hay ningún
 * hecho nuevo que contar —la ventana puede venir maximizada de antes de una
 * recarga—, y después de eso el estado cambia por cosas que el renderer no
 * puede ver.
 */
function useMaximizedState(): boolean {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void window.pastecode.invoke('window:isMaximized', {}).then((result) => {
      if (result.ok) setIsMaximized(result.value.isMaximized);
    });

    return window.pastecode.subscribe('window:maximizedChanged', (event) => {
      setIsMaximized(event.isMaximized);
    });
  }, []);

  return isMaximized;
}
