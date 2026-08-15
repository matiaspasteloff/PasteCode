import { useEffect, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

/**
 * Diálogo de conflicto: el archivo cambió en disco desde que se abrió.
 *
 * **Nada se recarga en silencio.** Las dos salidas destruyen trabajo de
 * alguien —sobrescribir pisa lo que hizo el otro proceso, descartar pierde lo
 * que se escribió acá—, así que la decisión es de la persona y las dos
 * opciones se nombran por lo que hacen.
 *
 * Es un `<dialog>` nativo con `showModal`, que trae gratis el foco atrapado
 * mientras está abierto, el cierre con `Escape` y el rol de diálogo modal que
 * pide RNF-23.
 */
export function ConflictDialog(): React.JSX.Element {
  const conflict = useEditorStore((state) => state.conflict);
  const save = useEditorStore((state) => state.save);
  const discardAndReload = useEditorStore((state) => state.discardAndReload);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    // `showModal` es imperativo: no hay atributo que lo active, y sin él el
    // `<dialog>` se pinta pero no atrapa el foco ni bloquea el fondo.
    if (conflict !== null && !dialog.open) dialog.showModal();
    if (conflict === null && dialog.open) dialog.close();
  }, [conflict]);

  // El `<dialog>` se monta siempre y sólo cambia su contenido. Desmontarlo
  // mientras está abierto deja la página inerte: el elemento sale del DOM sin
  // pasar por `close()`, así que nunca abandona la top layer y el resto de la
  // app queda sin foco ni accesible. Lo encontró el E2E de "descartar".
  return (
    <dialog ref={dialogRef} className="conflict" data-testid="conflict-dialog">
      {conflict !== null && (
        <>
          <h2 className="conflict__title">{t('conflict.title')}</h2>
          <p className="conflict__message">{conflict.userMessage}</p>

          <div className="conflict__actions">
            <button
              type="button"
              onClick={() => {
                void save({ force: true });
              }}
            >
              {t('conflict.overwrite')}
            </button>

            <button
              type="button"
              onClick={() => {
                void discardAndReload();
              }}
            >
              {t('conflict.discard')}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
