import { useEffect, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useFileTreeStore } from '../../stores/file-tree-store.js';

/**
 * Confirmación de eliminado.
 *
 * Pregunta aunque el destino sea la papelera, y no es ceremonia de más: el
 * árbol es donde más fácil se le pega a la tecla equivocada, y `Delete` está
 * pegada a las flechas con las que se navega.
 *
 * El texto **nombra la papelera** en vez de decir "eliminar" a secas. Es la
 * diferencia entre una acción que da miedo y una que se entiende, y es cierta:
 * RF-003 exige papelera del sistema operativo.
 *
 * Mismo `<dialog>` nativo con `showModal` que `ConflictDialog`, y por las
 * mismas razones —foco atrapado, `Escape` que cierra, rol modal de RNF-23—,
 * incluido el detalle de montarlo siempre y cambiarle el contenido.
 */
export function DeleteDialog(): React.JSX.Element {
  const pending = useFileTreeStore((state) => state.pendingDeletion);
  const cancelDeletion = useFileTreeStore((state) => state.cancelDeletion);
  const confirmDeletion = useFileTreeStore((state) => state.confirmDeletion);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (pending !== null && !dialog.open) dialog.showModal();
    if (pending === null && dialog.open) dialog.close();
  }, [pending]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm"
      data-testid="delete-dialog"
      // `Escape` cierra el `<dialog>` por su cuenta, sin avisarle al store, y
      // sin esto el estado quedaría creyendo que el diálogo sigue abierto y no
      // volvería a abrirlo nunca.
      onClose={cancelDeletion}
    >
      {pending !== null && (
        <>
          <h2 className="confirm__title">{t('fileTree.deleteTitle')}</h2>
          {/* El nombre va en su propio elemento y no interpolado en la frase:
              `t` no toma parámetros a propósito —su JSDoc explica por qué— y
              partir la oración en dos claves para meterle un hueco al medio es
              exactamente lo que hace que una traducción quede imposible. */}
          <p className="confirm__name">{pending.name}</p>
          <p className="confirm__message">{t('fileTree.deleteMessage')}</p>

          <div className="confirm__actions">
            <button
              type="button"
              data-testid="delete-confirm"
              onClick={() => {
                void confirmDeletion();
              }}
            >
              {t('fileTree.deleteConfirm')}
            </button>

            <button type="button" onClick={cancelDeletion}>
              {t('fileTree.deleteCancel')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
