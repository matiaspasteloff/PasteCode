import { useState } from 'react';

import { t } from '../../i18n/index.js';
import { useDebugStore } from '../../stores/debug-store.js';

/**
 * La consola de depuración
 * ([RF-505](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Muestra lo que el programa escribe y evalúa expresiones en el frame
 * seleccionado. Las dos mitades comparten la lista: lo que se evalúa queda
 * anotado al lado de lo que salió del programa, que es lo que hace que se pueda
 * leer la sesión como una conversación en vez de dos columnas sin relación.
 *
 * **Una expresión que el adaptador rechaza no es un error de la aplicación.** Se
 * dibuja en la consola marcada como fallida, igual que en cualquier REPL;
 * tratarla como una falla del IDE sería castigar un typo con un diálogo.
 */
export function DebugConsole(): React.JSX.Element {
  const lines = useDebugStore((store) => store.console);

  return (
    <div className="debug-console">
      <ol className="debug-console__lines" data-testid="debug-console">
        {lines.map((line, index) => (
          <li
            // El índice es la clave correcta acá: la consola es un log —sólo
            // crece por el final— así que dos líneas iguales en posiciones
            // distintas son dos eventos distintos, y no hay reordenamiento que
            // pueda confundir a React.
            key={index}
            className={`debug-console__line debug-console__line--${line.category}`}
          >
            {line.text}
          </li>
        ))}
      </ol>

      <ConsoleInput />
    </div>
  );
}

/** La línea donde se escriben expresiones para evaluar en el frame actual. */
function ConsoleInput(): React.JSX.Element {
  const append = useDebugStore((store) => store.appendConsole);
  const frameId = useDebugStore((store) => store.selectedFrameId);
  const state = useDebugStore((store) => store.status.state);
  const [expression, setExpression] = useState('');

  const evaluate = async (): Promise<void> => {
    const trimmed = expression.trim();

    if (trimmed === '') return;

    // Se anota lo que se escribió antes de mandar: si el adaptador tarda, la
    // consola ya muestra que la expresión se envió.
    append({ category: 'input', text: `> ${trimmed}` });
    setExpression('');

    const result = await window.pastecode.invoke('debug:evaluate', {
      expression: trimmed,
      frameId,
    });

    if (!result.ok) {
      append({ category: 'stderr', text: result.error.userMessage });
      return;
    }

    append({ category: result.value.failed ? 'stderr' : 'stdout', text: result.value.result });
  };

  return (
    <input
      type="text"
      className="debug-console__input"
      data-testid="debug-console-input"
      placeholder={t('debug.evaluate')}
      aria-label={t('debug.evaluate')}
      value={expression}
      disabled={state === 'idle' || state === 'unavailable'}
      onChange={(event) => {
        setExpression(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;

        event.preventDefault();
        void evaluate();
      }}
    />
  );
}
