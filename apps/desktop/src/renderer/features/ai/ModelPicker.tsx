import { t } from '../../i18n/index.js';
import { useAiStore } from '../../stores/ai-store.js';

/**
 * El selector de modelo.
 *
 * Un `<select>` nativo y no un `QuickPick`, al revés que el selector de temas:
 * acá no hay preview que aplicar al mover la selección, la lista es corta y
 * está siempre a la vista arriba del chat. Un modal para elegir de una lista
 * de veinte entradas sería ceremonia.
 *
 * **La lista sólo tiene gratuitos** porque es lo único que devuelve
 * `ai:listModels`. El canal lo verifica otra vez del lado del main: esto evita
 * el error, aquello evita el abuso ([RF-1002](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)).
 */
export function ModelPicker(): React.JSX.Element {
  const models = useAiStore((state) => state.models);
  const modelId = useAiStore((state) => state.modelId);
  const selectModel = useAiStore((state) => state.selectModel);
  const isStreaming = useAiStore((state) => state.requestId !== null);

  return (
    <select
      className="ai-panel__model"
      aria-label={t('ai.model')}
      data-testid="ai-model"
      value={modelId ?? ''}
      // Cambiar de modelo a mitad de una respuesta dejaría la conversación
      // partida entre dos: lo que ya se dijo lo dijo el anterior.
      disabled={isStreaming || models.length === 0}
      onChange={(event) => {
        selectModel(event.target.value);
      }}
    >
      {models.length === 0 && <option value="">{t('ai.noModels')}</option>}

      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name}
        </option>
      ))}
    </select>
  );
}
