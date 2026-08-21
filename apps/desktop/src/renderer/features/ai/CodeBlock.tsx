import { t } from '../../i18n/index.js';
import { getActiveEditor } from '../editor/monaco-instance.js';

/**
 * Un bloque de código de una respuesta, con lo que se puede hacer con él.
 *
 * Las tres acciones de [RF-1008](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)
 * son las que convierten una respuesta en trabajo hecho: copiar sirve siempre,
 * insertar en el cursor sirve cuando el código va en un lugar nuevo, y
 * reemplazar la selección sirve cuando se le pidió que arregle algo que está
 * seleccionado.
 *
 * **Insertar y reemplazar sólo aparecen con un editor abierto.** Un botón que
 * no puede hacer nada es peor que uno que no está: deshabilitado invita a
 * preguntarse por qué, y ausente no.
 *
 * **Es presentacional**: no lee el store del asistente
 * ([regla 3 de React](../../../../../../docs/convenciones/codigo.md#reglas-de-react)).
 */
export function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}): React.JSX.Element {
  const editor = getActiveEditor();

  return (
    <figure className="ai-code">
      <figcaption className="ai-code__header">
        <span className="ai-code__language">{language === '' ? t('ai.code') : language}</span>

        <span className="ai-code__actions">
          <button
            type="button"
            onClick={() => {
              void window.pastecode.invoke('clipboard:writeText', { text: code });
            }}
          >
            {t('ai.copy')}
          </button>

          {editor !== null && (
            <>
              <button
                type="button"
                onClick={() => {
                  insertAtCursor(code);
                }}
              >
                {t('ai.insert')}
              </button>
              <button
                type="button"
                onClick={() => {
                  replaceSelection(code);
                }}
              >
                {t('ai.replace')}
              </button>
            </>
          )}
        </span>
      </figcaption>

      <pre className="ai-code__body">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

/**
 * Escribe el código donde está el cursor.
 *
 * `executeEdits` y no `setValue` ni una edición sobre el modelo a mano: es lo
 * único que entra en la pila de deshacer del editor. Sin eso, `Ctrl+Z` después
 * de insertar no deshace la inserción sino lo que la persona había escrito
 * antes, que es peor que no tener el botón.
 */
function insertAtCursor(code: string): void {
  const editor = getActiveEditor();
  const position = editor?.getPosition();

  if (editor === null || position === null || position === undefined) return;

  editor.executeEdits('pastecode.ai', [
    {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text: code,
    },
  ]);
  editor.focus();
}

/** Reemplaza lo que esté seleccionado. Sin selección, es una inserción. */
function replaceSelection(code: string): void {
  const editor = getActiveEditor();
  const selection = editor?.getSelection();

  if (editor === null || selection === null || selection === undefined) return;

  editor.executeEdits('pastecode.ai', [{ range: selection, text: code }]);
  editor.focus();
}
