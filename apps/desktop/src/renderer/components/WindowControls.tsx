import { useEffect, useState } from 'react';

import { t } from '../i18n/index.js';

import { IconClose } from './icons/IconClose.js';
import { IconMaximize } from './icons/IconMaximize.js';
import { IconMinimize } from './icons/IconMinimize.js';
import { IconRestore } from './icons/IconRestore.js';

/**
 * Tamaño de los glifos. Diez píxeles es lo que mide el glifo del marco nativo
 * de Windows, que es al que estos botones tienen que parecerse.
 */
const GLYPH_SIZE = 10;

/**
 * Los tres botones de ventana de la barra de título.
 *
 * El de maximizar **cambia de glifo con el estado**, y ese estado no se puede
 * simplemente preguntar una vez: arrastrar la ventana al borde superior la
 * maximiza sin que nadie apriete nada. De ahí el par pregunta/evento
 * (`window:isMaximized` + `window:maximizedChanged`), que es el mismo par de
 * `git:getStatus` / `git:changed`.
 *
 * Los glifos son SVG propios y no los caracteres de _Segoe Fluent Icons_ que
 * dibuja el marco nativo: esa fuente sólo existe en Windows, y en Linux los
 * botones salían como cajas vacías (hallazgo D5 de la auditoría). En macOS
 * este componente no se dibuja: los botones son el semáforo nativo
 * (`TitleToolbar`).
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
        <IconMinimize size={GLYPH_SIZE} />
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
        {isMaximized ? <IconRestore size={GLYPH_SIZE} /> : <IconMaximize size={GLYPH_SIZE} />}
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
        <IconClose size={GLYPH_SIZE} />
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
