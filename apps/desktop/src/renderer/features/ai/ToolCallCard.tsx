import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../i18n/index.js';
import type { PendingToolCall } from '../../stores/ai-store.js';
import { useAiStore } from '../../stores/ai-store.js';
import { currentResolvedTheme, monacoThemeFor } from '../theme/use-theme.js';

/** El nombre del archivo, sin la ruta. Es lo que se muestra en el encabezado. */
function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

/**
 * Una propuesta de escritura, con su diff y sus dos botones.
 *
 * **Es el único punto donde una persona ve qué se va a escribir antes de que
 * se escriba** ([RF-1006](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)).
 * El main resolvió la ruta y leyó lo que hay; acá se muestra la diferencia y
 * se decide. "Descartar" no escribe nada y se lo informa al modelo, que si no
 * sigue razonando sobre un archivo que no cambió.
 *
 * El diff es `monaco.editor.createDiffEditor`, que ya está en el bundle. Una
 * librería de diff sería peso nuevo contra RNF-05 para mostrar algo que el
 * editor que ya tenemos hace mejor.
 */
export function ToolCallCard({ call }: { call: PendingToolCall }): React.JSX.Element {
  const answer = useAiStore((state) => state.answerToolCall);
  const [isBusy, setIsBusy] = useState(false);
  const diffRef = useDiffEditor(call);

  return (
    <section className="ai-tool-call" data-testid="ai-tool-call">
      <header className="ai-tool-call__header">
        <span className="ai-tool-call__title">
          {call.previousContent === null ? t('ai.willCreate') : t('ai.willWrite')}
        </span>
        <code className="ai-tool-call__path" title={call.path}>
          {fileNameOf(call.path)}
        </code>
      </header>

      <div ref={diffRef} className="ai-tool-call__diff" data-testid="ai-tool-diff" />

      <footer className="ai-tool-call__actions">
        <button
          type="button"
          className="ai-tool-call__apply"
          disabled={isBusy}
          data-testid="ai-tool-apply"
          onClick={() => {
            setIsBusy(true);
            void applyProposal(call, answer).finally(() => {
              setIsBusy(false);
            });
          }}
        >
          {t('ai.apply')}
        </button>

        <button
          type="button"
          disabled={isBusy}
          data-testid="ai-tool-discard"
          onClick={() => {
            void answer(call.toolCallId, 'discarded', '');
          }}
        >
          {t('ai.discard')}
        </button>
      </footer>
    </section>
  );
}

/**
 * Escribe el archivo por el canal `fs:*` de siempre y contesta al modelo.
 *
 * **La escritura la hace el renderer, no el main.** Es lo que hace que pase
 * por el mismo camino que un `Ctrl+S`: la misma escritura atómica de RNF-07,
 * el mismo `noteOwnWrite` del watcher, la misma validación de ruta. Un camino
 * aparte para las escrituras del asistente sería un segundo lugar donde
 * arreglar el próximo bug de guardado.
 */
async function applyProposal(
  call: PendingToolCall,
  answer: (toolCallId: string, outcome: 'applied' | 'failed', detail: string) => Promise<void>
): Promise<void> {
  const channel = call.previousContent === null ? 'fs:createFile' : 'fs:writeFile';

  // Un archivo nuevo se crea vacío y se escribe después: `fs:createFile` es
  // creación exclusiva —falla si ya existe, que es la mitad de su valor— y no
  // acepta contenido.
  if (channel === 'fs:createFile') {
    const created = await window.pastecode.invoke('fs:createFile', { path: call.path });

    if (!created.ok) {
      await answer(call.toolCallId, 'failed', created.error.userMessage);
      return;
    }
  }

  const written = await window.pastecode.invoke('fs:writeFile', {
    path: call.path,
    content: call.nextContent,
  });

  if (!written.ok) await answer(call.toolCallId, 'failed', written.error.userMessage);
  else await answer(call.toolCallId, 'applied', '');
}

/**
 * Monta un editor de diff de sólo lectura con la propuesta.
 *
 * Monaco entra por `import()` dinámico, igual que en el editor y por la misma
 * razón: son casi 4MB y RNF-01 pide arrancar en menos de 1,5s. Acá encima es
 * gratis, porque una tarjeta de confirmación no existe hasta que el asistente
 * propone algo — que nunca es al arrancar.
 */
function useDiffEditor(call: PendingToolCall): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = containerRef.current;
    if (host === null) return;

    let editor: MonacoApi.editor.IStandaloneDiffEditor | null = null;
    let models: MonacoApi.editor.ITextModel[] = [];

    void import('../editor/monaco-setup.js').then(({ monaco }) => {
      // El contenedor pudo desmontarse mientras Monaco se cargaba.
      if (containerRef.current === null) return;

      const original = monaco.editor.createModel(call.previousContent ?? '');
      const modified = monaco.editor.createModel(call.nextContent);

      models = [original, modified];
      editor = monaco.editor.createDiffEditor(host, {
        readOnly: true,
        renderSideBySide: false,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        theme: monacoThemeFor(currentResolvedTheme()),
      });
      editor.setModel({ original, modified });
    });

    return () => {
      editor?.dispose();
      // Los modelos no los libera el editor: sin esto, cada propuesta deja dos
      // modelos vivos hasta que se cierre la ventana (RNF-04).
      for (const model of models) model.dispose();
    };
  }, [call]);

  return containerRef;
}
