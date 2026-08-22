import { useEffect, useRef, useState } from 'react';

import { t } from '../../i18n/index.js';
import { useAiStore } from '../../stores/ai-store.js';

/**
 * El diálogo donde se pega la clave de OpenRouter.
 *
 * **La clave sale de acá hacia el main y no vuelve nunca.** Se guarda cifrada
 * con `safeStorage` y el único canal que pregunta por ella devuelve un
 * booleano ([RF-1003](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)),
 * así que este campo no se puede rellenar con lo que ya está guardado — y es a
 * propósito: una clave que el renderer puede leer es una clave que puede leer
 * cualquier XSS o cualquier extensión.
 *
 * Cuando `canPersist` es falso se avisa **antes** de escribirla, no después:
 * enterarse de que no se guardó al reabrir la app es la peor forma de
 * enterarse.
 *
 * **Es un `<dialog>` nativo con `showModal`**, igual que `ConflictDialog` y
 * `DeleteDialog`. Antes era un `<div>` que imitaba un modal, y no lo era: sin
 * `position` ni `showModal`, el diálogo entraba en la grilla de `.app` como un
 * hijo más y caía en la columna del rail de actividades —3rem de ancho—, que
 * es lo que partía el texto en una palabra por línea. Con el elemento nativo,
 * la top layer, el `::backdrop`, el foco atrapado y `Escape` salen gratis y son
 * los mismos que los otros dos diálogos (RNF-23).
 */
export function ApiKeyDialog(): React.JSX.Element {
  const isOpen = useAiStore((state) => state.isKeyDialogOpen);
  const close = useAiStore((state) => state.closeKeyDialog);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    // `showModal` es imperativo: no hay atributo que lo active, y sin él el
    // `<dialog>` se pinta pero no atrapa el foco ni bloquea el fondo.
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // El `<dialog>` se monta siempre y sólo cambia su contenido, por lo mismo que
  // `ConflictDialog`: desmontarlo mientras está abierto lo saca del DOM sin
  // pasar por `close()`, así que nunca abandona la top layer y el resto de la
  // app queda inerte.
  return (
    <dialog
      ref={dialogRef}
      className="confirm"
      data-testid="ai-key-dialog"
      // `Escape` cierra el `<dialog>` por su cuenta, sin avisarle al store, y
      // sin esto el estado quedaría creyendo que sigue abierto y no volvería a
      // abrirlo nunca.
      onClose={close}
    >
      {isOpen && <ApiKeyForm />}
    </dialog>
  );
}

/**
 * El formulario, montado sólo mientras el diálogo está abierto.
 *
 * Va en su propio componente para que su `useState` **se cree y se destruya con
 * el diálogo**: lo que se escribe acá es un secreto, y un estado que sobrevive
 * al cierre lo deja en memoria y lo muestra de nuevo al reabrir.
 */
function ApiKeyForm(): React.JSX.Element {
  const canPersist = useAiStore((state) => state.canPersist);
  const setApiKey = useAiStore((state) => state.setApiKey);
  const [value, setValue] = useState('');

  return (
    <form
      className="ai-key__form"
      aria-label={t('ai.keyTitle')}
      onSubmit={(event) => {
        event.preventDefault();
        void setApiKey(value);
        setValue('');
      }}
    >
      <h2 className="confirm__title">{t('ai.keyTitle')}</h2>
      <p className="confirm__message">{t('ai.keyMessage')}</p>

      {!canPersist && (
        <p className="confirm__message" role="alert">
          {t('ai.keyNotPersisted')}
        </p>
      )}

      <label className="ai-key__label">
        {t('ai.keyLabel')}
        <input
          // `password` y no `text`: no protege de nada técnicamente —el valor
          // está en el DOM igual— pero evita el caso real, que es pegar la
          // clave con alguien mirando la pantalla o grabando la sesión.
          type="password"
          className="ai-key__input"
          data-testid="ai-key-input"
          autoFocus
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </label>

      <Actions canSave={value.trim() !== ''} />
    </form>
  );
}

/**
 * Los tres botones del diálogo.
 *
 * Lee el store en vez de recibir todo por props, al revés que el resto de los
 * componentes de esta carpeta: borrar la clave y cerrar son acciones del
 * diálogo, no del formulario, y pasarlas por prop sólo agregaría dos
 * parámetros que el padre reenvía sin usar.
 */
function Actions({ canSave }: { canSave: boolean }): React.JSX.Element {
  const hasKey = useAiStore((state) => state.hasKey);
  const clearApiKey = useAiStore((state) => state.clearApiKey);
  const close = useAiStore((state) => state.closeKeyDialog);

  return (
    <div className="confirm__actions">
      <button type="submit" disabled={!canSave} data-testid="ai-key-save">
        {t('ai.keySave')}
      </button>

      {hasKey && (
        <button
          type="button"
          data-testid="ai-key-clear"
          onClick={() => {
            void clearApiKey();
            close();
          }}
        >
          {t('ai.keyClear')}
        </button>
      )}

      <button type="button" data-testid="ai-key-cancel" onClick={close}>
        {t('ai.keyCancel')}
      </button>
    </div>
  );
}
