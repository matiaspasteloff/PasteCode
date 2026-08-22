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

/** Qué dice el encabezado, según si el cambio ya está en el disco o no. */
function titleFor(call: PendingToolCall, isApplied: boolean): string {
  if (isApplied) return call.previousContent === null ? t('ai.willCreate') : t('ai.willEdit');

  return call.previousContent === null ? t('ai.willCreate') : t('ai.willWrite');
}

/**
 * Un cambio del asistente, con su diff.
 *
 * Tiene **dos estados**, y son los dos modos de trabajo del asistente:
 *
 * - **Pendiente** — el camino de [ADR-0029](../../../../../docs/adr/0029-asistente-de-ia-en-el-main.md):
 *   nada se escribió todavía, y los botones Aplicar / Descartar son el único
 *   punto donde una persona ve qué se va a escribir **antes** de que se
 *   escriba. Es lo que pasa cuando el evento llega sin `autoApply`.
 * - **Aplicado** — el camino de [ADR-0032](../../../../../docs/adr/0032-modos-del-asistente-y-edicion-directa.md):
 *   el archivo ya cambió en el disco y la tarjeta es el checkpoint. El diff
 *   sigue mostrando exactamente lo mismo, y Revertir lo deshace.
 *
 * El diff es `monaco.editor.createDiffEditor`, que ya está en el bundle. Una
 * librería de diff sería peso nuevo contra RNF-05 para mostrar algo que el
 * editor que ya tenemos hace mejor.
 *
 * @param props La propuesta y si ya se escribió.
 * @returns La tarjeta.
 * @example
 * <ToolCallCard call={call} isApplied />
 */
export function ToolCallCard({
  call,
  isApplied = false,
}: {
  call: PendingToolCall;
  isApplied?: boolean;
}): React.JSX.Element {
  const diffRef = useDiffEditor(call);

  return (
    <section
      className="ai-tool-call"
      data-testid="ai-tool-call"
      data-applied={isApplied}
      aria-label={`${titleFor(call, isApplied)} ${fileNameOf(call.path)}`}
    >
      <header className="ai-tool-call__header">
        <span className="ai-tool-call__title">{titleFor(call, isApplied)}</span>
        <code className="ai-tool-call__path" title={call.path}>
          {fileNameOf(call.path)}
        </code>
      </header>

      <div ref={diffRef} className="ai-tool-call__diff" data-testid="ai-tool-diff" />

      {isApplied ? <AppliedActions call={call} /> : <PendingActions call={call} />}
    </section>
  );
}

/** Los dos botones de una propuesta que todavía no tocó el disco. */
function PendingActions({ call }: { call: PendingToolCall }): React.JSX.Element {
  const applyCall = useAiStore((state) => state.applyCall);
  const answer = useAiStore((state) => state.answerToolCall);
  const [isBusy, setIsBusy] = useState(false);

  return (
    <footer className="ai-tool-call__actions">
      <button
        type="button"
        className="ai-tool-call__apply"
        disabled={isBusy}
        data-testid="ai-tool-apply"
        onClick={() => {
          setIsBusy(true);
          void applyCall(call).finally(() => {
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
  );
}

/**
 * El botón de un cambio que ya está en el disco.
 *
 * Es la red de seguridad que hace defendible el modo agente: el "deshacer" que
 * ADR-0029 decía que no existía para un archivo que no estaba abierto en el
 * editor existe acá, porque el contenido anterior viajó en el propio evento.
 */
function AppliedActions({ call }: { call: PendingToolCall }): React.JSX.Element {
  const revert = useAiStore((state) => state.revert);
  const [isBusy, setIsBusy] = useState(false);

  return (
    <footer className="ai-tool-call__actions">
      <span className="ai-tool-call__badge">{t('ai.applied')}</span>

      <button
        type="button"
        disabled={isBusy}
        data-testid="ai-tool-revert"
        onClick={() => {
          setIsBusy(true);
          void revert(call.toolCallId).finally(() => {
            setIsBusy(false);
          });
        }}
      >
        {t('ai.revert')}
      </button>
    </footer>
  );
}

/**
 * Monta un editor de diff de sólo lectura con el cambio.
 *
 * Monaco entra por `import()` dinámico, igual que en el editor y por la misma
 * razón: son casi 4MB y RNF-01 pide arrancar en menos de 1,5s. Acá encima es
 * gratis, porque una tarjeta no existe hasta que el asistente toca un archivo
 * — que nunca es al arrancar.
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
      // Los modelos no los libera el editor: sin esto, cada tarjeta deja dos
      // modelos vivos hasta que se cierre la ventana (RNF-04).
      for (const model of models) model.dispose();
    };
  }, [call]);

  return containerRef;
}
