import type { AiMessage } from '@pastecode/core';
import { splitMarkdown } from '@pastecode/core';

import { t } from '../../i18n/index.js';

import { CodeBlock } from './CodeBlock.js';

/**
 * Un mensaje de la conversación, con sus bloques de código separados.
 *
 * El texto se parte con `splitMarkdown`, que es puro y vive en `core`. **No
 * hay `dangerouslySetInnerHTML` en ningún lado**: la respuesta de un modelo es
 * contenido de terceros que puede haber sido influido por un archivo del
 * workspace, y renderizar HTML de ahí sería darle al proyecto la superficie de
 * XSS que la CSP existe para no tener.
 *
 * **Es presentacional**: recibe el mensaje y avisa nada
 * ([regla 3 de React](../../../../../../docs/convenciones/codigo.md#reglas-de-react)).
 */
export function Message({
  message,
  isStreaming = false,
}: {
  message: AiMessage;
  isStreaming?: boolean;
}): React.JSX.Element {
  return (
    <article
      className="ai-message"
      data-role={message.role}
      data-testid={`ai-message-${message.role}`}
    >
      <header className="ai-message__author">
        {message.role === 'user' ? t('ai.you') : t('ai.assistant')}
      </header>

      {splitMarkdown(message.content).map((block, index) =>
        block.kind === 'code' ? (
          <CodeBlock
            // El índice como clave es correcto acá y sólo acá: los bloques de
            // un mensaje no se reordenan ni se borran, sólo crece el último
            // mientras la respuesta se escribe.
            key={index}
            language={block.language}
            code={block.code}
          />
        ) : (
          <p key={index} className="ai-message__prose">
            {block.text}
          </p>
        )
      )}

      {isStreaming && (
        <span className="ai-message__caret" aria-hidden>
          ▍
        </span>
      )}
    </article>
  );
}
