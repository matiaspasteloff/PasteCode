import { useState } from 'react';

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
 */
export function ApiKeyDialog(): React.JSX.Element | null {
  const isOpen = useAiStore((state) => state.isKeyDialogOpen);
  const canPersist = useAiStore((state) => state.canPersist);
  const setApiKey = useAiStore((state) => state.setApiKey);
  const close = useAiStore((state) => state.closeKeyDialog);
  const [value, setValue] = useState('');

  if (!isOpen) return null;

  return (
    <div className="confirm" role="presentation" onClick={close}>
      <form
        className="confirm__panel"
        role="dialog"
        aria-modal
        aria-label={t('ai.keyTitle')}
        data-testid="ai-key-dialog"
        onClick={(event) => {
          event.stopPropagation();
        }}
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
    </div>
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
          onClick={() => {
            void clearApiKey();
            close();
          }}
        >
          {t('ai.keyClear')}
        </button>
      )}

      <button type="button" onClick={close}>
        {t('ai.keyCancel')}
      </button>
    </div>
  );
}
