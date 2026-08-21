import { useEffect, useRef } from 'react';

import { t } from '../../i18n/index.js';
import { useAiStore } from '../../stores/ai-store.js';

import { Message } from './Message.js';
import { ToolCallCard } from './ToolCallCard.js';

/**
 * La conversación, con lo que se está escribiendo y las propuestas pendientes.
 *
 * **Sin virtualizar, a diferencia de `QuickPickList`.** `codigo.md` la exige a
 * partir de cien elementos, y una conversación no llega: el recorte por
 * presupuesto de contexto la mantiene en decenas de mensajes, y virtualizar
 * filas de alto variable —que es lo que son los mensajes— cuesta medirlas
 * todas en cada render, que es más caro que dibujarlas.
 */
export function MessageList(): React.JSX.Element {
  const messages = useAiStore((state) => state.messages);
  const streamingText = useAiStore((state) => state.streamingText);
  const pending = useAiStore((state) => state.pending);
  const error = useAiStore((state) => state.error);
  const bottomRef = useAutoScroll(
    `${String(messages.length)}:${String(streamingText.length)}:${String(pending.length)}`
  );

  return (
    <div className="ai-panel__messages" data-testid="ai-messages">
      {messages.length === 0 && streamingText === '' && (
        <p className="ai-panel__empty">{t('ai.empty')}</p>
      )}

      {messages.map((message, index) => (
        // El índice como clave: los mensajes no se reordenan ni se borran de
        // adentro de la conversación, sólo se agregan al final.
        <Message key={index} message={message} />
      ))}

      {streamingText !== '' && (
        <Message message={{ role: 'assistant', content: streamingText }} isStreaming />
      )}

      {pending.map((call) => (
        <ToolCallCard key={call.toolCallId} call={call} />
      ))}

      {error !== null && (
        <p className="ai-panel__error" role="alert">
          {error.userMessage}
        </p>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Mantiene la vista pegada al final mientras llega la respuesta.
 *
 * `scrollIntoView` sobre un ancla al final y no `scrollTop = scrollHeight`:
 * el alto todavía no está calculado cuando el efecto corre, así que la segunda
 * forma se queda un render corta y la respuesta parece cortarse.
 *
 * Recibe una **firma** y no un array de dependencias: un array literal es una
 * referencia nueva en cada render, así que el efecto correría siempre y el
 * linter de hooks no podría verificar nada. Con un string, la comparación por
 * valor de React hace exactamente lo que hace falta.
 */
function useAutoScroll(signature: string): React.RefObject<HTMLDivElement | null> {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [signature]);

  return bottomRef;
}
