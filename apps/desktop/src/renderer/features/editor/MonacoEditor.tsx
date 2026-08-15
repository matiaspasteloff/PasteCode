import { t } from '../../i18n/index.js';
import type { OpenFile } from '../../stores/editor-store.js';

import { useMonacoEditor } from './use-monaco-editor.js';

interface MonacoEditorProps {
  file: OpenFile;
}

/**
 * El editor.
 *
 * El componente es fino a propósito: todo el ciclo de vida —montaje por
 * `import()` dinámico, modelo, `dispose`— vive en `useMonacoEditor`. Monaco
 * maneja su propio DOM, así que React sólo aporta el contenedor y no tiene
 * que volver a renderizar nada cuando cambia el contenido.
 */
export function MonacoEditor({ file }: MonacoEditorProps): React.JSX.Element {
  const { containerRef, status } = useMonacoEditor(file);

  return (
    <div className="editor">
      {status !== 'ready' && (
        <p className="editor__status" role={status === 'failed' ? 'alert' : undefined}>
          {status === 'failed' ? t('editor.failed') : t('editor.loading')}
        </p>
      )}

      {/* Siempre montado: Monaco necesita un contenedor con medidas reales al
          momento de crearse, y uno detrás de un condicional todavía no existe. */}
      <div ref={containerRef} className="editor__surface" data-testid="editor-surface" />
    </div>
  );
}
