import { useEffect, useState } from 'react';

import { t } from '../../i18n/index.js';
import { useAiStore } from '../../stores/ai-store.js';

import { MessageList } from './MessageList.js';
import { ModelPicker } from './ModelPicker.js';

/**
 * La vista lateral del asistente.
 *
 * Entró como **una entrada más** en `SIDE_VIEWS` y en `SIDE_VIEW_REGISTRY`, y
 * el cascarón no se tocó: ése es justamente el punto del registro de
 * [ADR-0022](../../../../../docs/adr/0022-cascaron-con-barra-de-actividades.md),
 * y la cuarta vista es la prueba de que aguanta.
 *
 * Sin clave configurada no se ofrece un chat que no puede responder: se ofrece
 * configurarla. La [etapa experimental](../../../../../docs/01-vision-y-alcance.md#alcance-experimental)
 * es opt-in, y sin clave no sale una sola llamada de red.
 */
export function AiPanel(): React.JSX.Element {
  const hasKey = useAiStore((state) => state.hasKey);
  const models = useAiStore((state) => state.models);
  const loadModels = useAiStore((state) => state.loadModels);
  const openKeyDialog = useAiStore((state) => state.openKeyDialog);

  useEffect(() => {
    // Al montar y no al arrancar la app: sin abrir el panel, el asistente no
    // hace una sola llamada de red.
    if (hasKey && models.length === 0) void loadModels();
  }, [hasKey, models.length, loadModels]);

  if (!hasKey) {
    return (
      <div className="ai-panel ai-panel--empty">
        <p className="ai-panel__empty">{t('ai.needsKey')}</p>
        <button type="button" data-testid="ai-configure-key" onClick={openKeyDialog}>
          {t('ai.configureKey')}
        </button>
      </div>
    );
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel__toolbar">
        <ModelPicker />
        <button
          type="button"
          className="ai-panel__key"
          aria-label={t('ai.keyTitle')}
          title={t('ai.keyTitle')}
          onClick={openKeyDialog}
        >
          ⚙
        </button>
      </div>

      <MessageList />
      <Composer />
    </div>
  );
}

/**
 * El campo donde se escribe la pregunta.
 *
 * `Enter` manda y `Shift+Enter` hace un salto de línea, que es la convención
 * de cualquier chat.
 */
function Composer(): React.JSX.Element {
  const send = useAiStore((state) => state.send);
  const cancel = useAiStore((state) => state.cancel);
  const isStreaming = useAiStore((state) => state.requestId !== null);
  const [draft, setDraft] = useState('');

  const submit = (): void => {
    if (draft.trim() === '') return;

    void send(draft);
    setDraft('');
  };

  return (
    <form
      className="ai-panel__composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className="ai-panel__input"
        aria-label={t('ai.ask')}
        placeholder={t('ai.placeholder')}
        data-testid="ai-input"
        rows={3}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;

          event.preventDefault();
          submit();
        }}
      />

      <SendButton isStreaming={isStreaming} onCancel={cancel} />
    </form>
  );
}

/**
 * El botón de enviar, que mientras hay respuesta en curso pasa a cancelar.
 *
 * No se deshabilita: cancelar es exactamente lo que alguien quiere hacer en
 * ese momento, y un botón muerto ahí no le sirve a nadie.
 */
function SendButton({
  isStreaming,
  onCancel,
}: {
  isStreaming: boolean;
  onCancel: () => Promise<void>;
}): React.JSX.Element {
  return (
    <button
      type={isStreaming ? 'button' : 'submit'}
      className="ai-panel__send"
      data-testid="ai-send"
      onClick={
        isStreaming
          ? () => {
              void onCancel();
            }
          : undefined
      }
    >
      {isStreaming ? t('ai.cancel') : t('ai.send')}
    </button>
  );
}
