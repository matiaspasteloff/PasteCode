import type { AiChatMode } from '@pastecode/core';
import { AI_CHAT_MODES } from '@pastecode/core';

import type { TranslationKey } from '../../i18n/index.js';
import { t } from '../../i18n/index.js';
import { useAiStore } from '../../stores/ai-store.js';

/** Cómo se llama cada modo y qué hace, para el selector. */
const LABELS: Readonly<Record<AiChatMode, { label: TranslationKey; hint: TranslationKey }>> = {
  ask: { label: 'ai.modeAsk', hint: 'ai.modeAskHint' },
  plan: { label: 'ai.modePlan', hint: 'ai.modePlanHint' },
  agent: { label: 'ai.modeAgent', hint: 'ai.modeAgentHint' },
};

/**
 * El selector de modo, al lado del de modelo.
 *
 * Un `<select>` nativo por lo mismo que `ModelPicker`: son tres opciones que
 * viven arriba del chat, y un modal para elegir entre tres sería ceremonia.
 *
 * **La diferencia entre los modos no es cosmética y por eso está a la vista.**
 * En `agent` el asistente escribe en el disco sin preguntar; en los otros dos
 * ni siquiera recibe las herramientas para hacerlo. Que se pueda leer cuál
 * está activo sin abrir nada es la mitad de por qué el modo agente es
 * defendible ([ADR-0032](../../../../../docs/adr/0032-modos-del-asistente-y-edicion-directa.md)).
 *
 * @returns El selector.
 * @example
 * <AiModePicker />
 */
export function AiModePicker(): React.JSX.Element {
  const mode = useAiStore((state) => state.mode);
  const setMode = useAiStore((state) => state.setMode);
  const isStreaming = useAiStore((state) => state.requestId !== null);

  return (
    <select
      className="ai-panel__mode"
      aria-label={t('ai.mode')}
      title={t(LABELS[mode].hint)}
      data-testid="ai-mode"
      value={mode}
      // Cambiar de modo a mitad de una respuesta no cambiaría nada de esa
      // respuesta —las herramientas ya viajaron en la request— y sí haría
      // creer lo contrario.
      disabled={isStreaming}
      onChange={(event) => {
        const chosen = AI_CHAT_MODES.find((candidate) => candidate === event.target.value);

        if (chosen !== undefined) setMode(chosen);
      }}
    >
      {AI_CHAT_MODES.map((candidate) => (
        <option key={candidate} value={candidate}>
          {t(LABELS[candidate].label)}
        </option>
      ))}
    </select>
  );
}
