import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { useEffect, useRef, useState } from 'react';

import type { OpenFile } from '../../stores/editor-store.js';

import { languageOverrideFor } from './language.js';

/** En qué estado está el montaje de Monaco. */
type EditorStatus = 'loading' | 'ready' | 'failed';

interface MonacoEditorHandle {
  containerRef: React.RefObject<HTMLDivElement | null>;
  status: EditorStatus;
}

/**
 * Monta Monaco en un contenedor y le pone el archivo abierto.
 *
 * Monaco entra por `import()` dinámico y no por un import estático, y eso es
 * un requisito y no una preferencia: son varios megabytes, y
 * [RNF-01](../../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * pide arrancar en menos de 1,5s. Con import estático, la ventana no pinta
 * nada hasta que el editor entero esté parseado, incluso si lo que se abre es
 * una carpeta vacía.
 *
 * @param file El archivo a mostrar, o `null` si no hay ninguno.
 * @returns El ref del contenedor y el estado del montaje.
 * @example
 * const { containerRef, status } = useMonacoEditor(file);
 */
export function useMonacoEditor(file: OpenFile | null): MonacoEditorHandle {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoApi | null>(null);
  const [status, setStatus] = useState<EditorStatus>('loading');

  useEffect(() => {
    let isCancelled = false;

    void import('./monaco-setup.js')
      .then(({ monaco }) => {
        if (isCancelled || containerRef.current === null) return;

        monacoRef.current = monaco;
        editorRef.current = monaco.editor.create(containerRef.current, {
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!isCancelled) setStatus('failed');
      });

    return () => {
      isCancelled = true;
      // El modelo se dispone aparte: `editor.dispose()` no se lleva el modelo,
      // y un modelo huérfano queda retenido para siempre. Es la fuga que
      // RNF-04 va a hacer visible en cuanto haya pestañas.
      editorRef.current?.getModel()?.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (monaco === null || editor === null || file === null) return;

    const previous = editor.getModel();
    editor.setModel(createModel(monaco, file));
    // Un modelo por archivo abierto, y sólo uno abierto por ahora. El registro
    // que los reutiliza entre pestañas llega en el paso 16.
    previous?.dispose();
  }, [file, status]);

  return { containerRef, status };
}

/** Crea el modelo del archivo, dejando que Monaco deduzca el lenguaje. */
function createModel(monaco: typeof MonacoApi, file: OpenFile): MonacoApi.editor.ITextModel {
  const uri = monaco.Uri.file(file.path);
  const fileName = file.path.split(/[\\/]/).at(-1) ?? '';

  return monaco.editor.createModel(file.content, languageOverrideFor(fileName), uri);
}
