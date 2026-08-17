import { t } from '../../i18n/index.js';

import { useMonacoEditor } from './use-monaco-editor.js';

interface MonacoEditorProps {
  /** Ruta de la pestaña activa. */
  activePath: string;
  /** A qué grupo pertenece esta instancia. */
  groupId: string;
}

/**
 * El editor.
 *
 * El componente es fino a propósito: todo el ciclo de vida —montaje por
 * `import()` dinámico, modelos, view state, `dispose`— vive en
 * `useMonacoEditor` y en el registro de modelos. Monaco maneja su propio DOM,
 * así que React sólo aporta el contenedor.
 *
 * **No lleva `key` por archivo.** Remontarlo en cada cambio de pestaña
 * destruiría el editor y con él el view state que el registro justo acaba de
 * guardar; el punto de tener una sola instancia es cambiarle el modelo.
 */
export function MonacoEditor({ activePath, groupId }: MonacoEditorProps): React.JSX.Element {
  const { containerRef, status } = useMonacoEditor(activePath, groupId);

  return (
    <div className="editor">
      {status !== 'ready' && (
        <p className="editor__status" role={status === 'failed' ? 'alert' : undefined}>
          {status === 'failed' ? t('editor.failed') : t('editor.loading')}
        </p>
      )}

      {/* Siempre montado: Monaco necesita un contenedor con medidas reales al
          momento de crearse, y uno detrás de un condicional todavía no existe. */}
      <div
        ref={containerRef}
        className="editor__surface"
        data-testid="editor-surface"
        data-group={groupId}
      />
    </div>
  );
}
