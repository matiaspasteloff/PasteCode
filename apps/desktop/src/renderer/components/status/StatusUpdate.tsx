import type { UpdateState } from '@pastecode/core';
import { useEffect } from 'react';

import { t } from '../../i18n/index.js';
import { useCommandStore } from '../../stores/command-store.js';
import { useUpdateStore } from '../../stores/update-store.js';

/** Lo que se muestra: el texto y, si hacer clic hace algo, el comando. */
interface UpdateView {
  readonly text: string;
  readonly command?: string;
}

/** La versión nueva, o vacío si todavía no se sabe. */
function version(state: UpdateState): string {
  return state.availableVersion ?? '';
}

/**
 * Qué decir para cada estado, o `null` si no hay nada que decir.
 *
 * Una versión nueva, la descarga y lo descargado se muestran siempre: es
 * justamente el aviso. Lo demás —buscando, al día, el error, la app sin
 * empaquetar— sólo si la persona pidió buscar: un chequeo de arranque que no
 * encontró nada, o que falló por falta de red, no tiene por qué ocupar la
 * barra.
 *
 * Cuando la instalación no se actualiza sola (`canInstallInApp` en `false`),
 * la acción es abrir la página del release y no descargar.
 */
function viewOf(state: UpdateState, requested: boolean): UpdateView | null {
  switch (state.status) {
    case 'available':
      return {
        text: `${t('update.available')} ${version(state)}`,
        command: state.canInstallInApp ? 'app.downloadUpdate' : 'app.openReleasePage',
      };
    case 'downloading':
      return { text: `${t('update.downloading')} ${String(state.percent)}%` };
    case 'downloaded':
      return { text: t('update.downloaded'), command: 'app.installUpdate' };
    default:
      return requested ? requestedView(state) : null;
  }
}

/** Lo que sólo se muestra si la persona pidió buscar. */
function requestedView(state: UpdateState): UpdateView | null {
  switch (state.status) {
    case 'checking':
      return { text: t('update.checking') };
    case 'up-to-date':
      return { text: t('update.upToDate') };
    case 'error':
      return { text: t('update.error'), command: 'app.checkForUpdates' };
    case 'unsupported':
      return { text: t('update.unsupported'), command: 'app.openReleasePage' };
    default:
      return null;
  }
}

/** Trae el estado al montar y lo mantiene al día con `update:stateChanged`. */
function useUpdateSync(): void {
  const setState = useUpdateStore((store) => store.setState);

  useEffect(() => {
    void window.pastecode.invoke('update:getState', {}).then((result) => {
      if (result.ok) setState(result.value);
    });

    return window.pastecode.subscribe('update:stateChanged', setState);
  }, [setState]);
}

/**
 * El aviso de actualizaciones en la status bar, visible sólo cuando hay algo
 * que decir. Cuando hay algo que hacer es un botón que dispara el comando,
 * igual que los ítems de las extensiones: el clic y la paleta pasan por el
 * mismo lugar.
 */
export function StatusUpdate(): React.JSX.Element | null {
  useUpdateSync();
  const state = useUpdateStore((store) => store.state);
  const requested = useUpdateStore((store) => store.requested);
  const run = useCommandStore((store) => store.run);

  const view = state === null ? null : viewOf(state, requested);
  if (state === null || view === null) return null;

  if (view.command === undefined) {
    return (
      <span className="status-bar__item" data-testid="status-update" data-state={state.status}>
        {view.text}
      </span>
    );
  }

  const command = view.command;
  return (
    <button
      type="button"
      className="status-bar__item status-bar__item--action"
      data-testid="status-update"
      data-state={state.status}
      onClick={() => {
        void run(command);
      }}
    >
      {view.text}
    </button>
  );
}
