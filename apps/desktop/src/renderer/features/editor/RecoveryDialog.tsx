import { useEffect, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useRecoveryStore } from '../../stores/recovery-store.js';

/** Las rutas que se pueden recuperar. Presentacional y nada más. */
function RecoverableList({ paths }: { paths: readonly string[] }): React.JSX.Element {
  return (
    <ul className="confirm__list" data-testid="recovery-list">
      {paths.map((path) => (
        <li key={path} className="confirm__name">
          {path}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ofrece recuperar lo que quedó sin guardar de un cierre anterior (RNF-08).
 *
 * **Ofrece, no restaura solo.** Lo que hay en el respaldo puede ser de hace
 * media hora y el archivo en disco puede haberse editado con otra herramienta
 * mientras tanto; pisar uno con el otro sin preguntar es exactamente la pérdida
 * de datos que RNF-07 y RNF-08 existen para evitar.
 *
 * Se muestra sólo si hay algo que ofrecer, así que un arranque normal —el caso
 * de siempre— no ve ningún diálogo.
 *
 * Mismo `<dialog>` nativo con `showModal` que el de conflicto, y montado
 * siempre por la misma razón: desmontarlo abierto deja la página inerte.
 */
export function RecoveryDialog(): React.JSX.Element {
  const pending = useRecoveryStore((state) => state.pending);
  const dismiss = useRecoveryStore((state) => state.dismiss);
  const markRestored = useRecoveryStore((state) => state.markRestored);
  const restoreFromBackup = useEditorStore((state) => state.restoreFromBackup);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (pending.length > 0 && !dialog.open) dialog.showModal();
    if (pending.length === 0 && dialog.open) dialog.close();
  }, [pending]);

  return (
    <dialog ref={dialogRef} className="confirm" data-testid="recovery-dialog">
      {pending.length > 0 && (
        <>
          <h2 className="confirm__title">{t('recovery.title')}</h2>
          <p className="confirm__message">{t('recovery.message')}</p>

          <RecoverableList paths={pending.map((backup) => backup.path)} />

          <div className="confirm__actions">
            <button
              type="button"
              data-testid="recovery-restore"
              onClick={() => {
                // Se restauran todos y se abre el último: abrir uno por uno
                // sería una decisión más por archivo justo cuando lo que se
                // quiere es recuperar el trabajo y seguir.
                for (const backup of pending) {
                  void restoreFromBackup(backup.path, backup.content).then(() =>
                    markRestored(backup.path)
                  );
                }
              }}
            >
              {t('recovery.restore')}
            </button>

            <button
              type="button"
              data-testid="recovery-dismiss"
              onClick={() => {
                void dismiss();
              }}
            >
              {t('recovery.dismiss')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
