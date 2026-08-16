import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { useEffect, useRef, useState } from 'react';

import { useEditorStore } from '../../stores/editor-store.js';
import { useSettingsStore } from '../../stores/settings-store.js';
import { currentResolvedTheme, monacoThemeFor } from '../theme/use-theme.js';

import { rememberViewState, savedViewState, syncModelWithDisk } from './model-registry.js';
import { setActiveEditor, setLoadedMonaco } from './monaco-instance.js';
import { takeRestorePosition } from './restore-position.js';
import { useCursorPosition } from './use-cursor-position.js';

/** En qué estado está el montaje de Monaco. */
type EditorStatus = 'loading' | 'ready' | 'failed';

interface MonacoEditorHandle {
  containerRef: React.RefObject<HTMLDivElement | null>;
  status: EditorStatus;
}

/**
 * Monta **un solo** editor de Monaco y le va cambiando el modelo.
 *
 * Monaco entra por `import()` dinámico y no por un import estático, y eso es
 * un requisito y no una preferencia: son casi 4MB, y
 * [RNF-01](../../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * pide arrancar en menos de 1,5s. Con import estático, la ventana no pinta
 * nada hasta que el editor entero esté parseado, incluso si lo que se abre es
 * una carpeta vacía.
 *
 * @param activePath Ruta de la pestaña activa, o `null` si no hay ninguna.
 * @returns El ref del contenedor y el estado del montaje.
 * @example
 * const { containerRef, status } = useMonacoEditor(activePath);
 */
export function useMonacoEditor(activePath: string | null): MonacoEditorHandle {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoApi | null>(null);
  const shownPathRef = useRef<string | null>(null);
  const [status, setStatus] = useState<EditorStatus>('loading');

  const pendingFile = useEditorStore((state) => state.pendingFile);
  const consumePendingFile = useEditorStore((state) => state.consumePendingFile);
  const setContentReader = useEditorStore((state) => state.setContentReader);
  const markDirty = useEditorStore((state) => state.markDirty);

  useMountedEditor(containerRef, editorRef, monacoRef, setStatus);

  // El contenido recién leído se convierte en modelo una sola vez: de ahí en
  // más la fuente de verdad es el modelo, no el store.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco === null || pendingFile === null) return;

    syncModelWithDisk(monaco, pendingFile.path, pendingFile.content);
    consumePendingFile();
  }, [pendingFile, status, consumePendingFile]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor === null || monaco === null) return;

    showActiveModel({ editor, monaco, activePath, shownPathRef });
  }, [activePath, status, pendingFile]);

  // La suscripción a los cambios va en su propio efecto y no adentro del que
  // cambia el modelo. Cuando estaban juntos, cualquier re-render volvía a
  // correr el efecto: React ejecutaba la limpieza —que desuscribía— y el
  // cuerpo salía temprano por ser la misma ruta, así que la pestaña dejaba de
  // marcarse como sucia para siempre.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco === null || activePath === null) return undefined;

    const model = monaco.editor.getModel(monaco.Uri.file(activePath));
    if (model === null) return undefined;

    const subscription = model.onDidChangeContent(() => {
      markDirty();
    });

    return () => {
      subscription.dispose();
    };
  }, [activePath, status, pendingFile, markDirty]);

  useEffect(() => {
    setContentReader(() => editorRef.current?.getValue() ?? '');

    return () => {
      setContentReader(null);
    };
  }, [setContentReader]);

  useEditorSettings(editorRef, status, activePath);
  useCursorPosition(editorRef, status, activePath);

  return { containerRef, status };
}

/**
 * Aplica `editor.*` de las settings, en caliente.
 *
 * Es la mitad visible de [RF-704](../../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración):
 * cambiar `editor.fontSize` en el archivo y ver la letra crecer sin reiniciar.
 *
 * `tabSize` e `insertSpaces` van por el **modelo** y no por el editor: en
 * Monaco son propiedades del texto, no de la vista, y por eso viven en
 * `ITextModel.updateOptions`. De ahí que el efecto dependa también de la
 * pestaña activa — cada modelo se configura por separado.
 */
function useEditorSettings(
  editorRef: React.RefObject<MonacoApi.editor.IStandaloneCodeEditor | null>,
  status: EditorStatus,
  activePath: string | null
): void {
  const editorSettings = useSettingsStore((state) => state.settings.editor);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null || status !== 'ready') return;

    editor.updateOptions({
      fontSize: editorSettings.fontSize,
      fontFamily: editorSettings.fontFamily,
      wordWrap: editorSettings.wordWrap,
      minimap: { enabled: editorSettings.minimap },
      renderWhitespace: editorSettings.renderWhitespace,
    });

    editor.getModel()?.updateOptions({
      tabSize: editorSettings.tabSize,
      insertSpaces: editorSettings.insertSpaces,
    });
  }, [editorRef, editorSettings, status, activePath]);
}

/**
 * Carga Monaco y crea la única instancia de editor.
 *
 * Está separado del hook principal porque el montaje y el cambio de modelo son
 * dos ciclos de vida distintos: uno corre una vez, el otro en cada pestaña.
 */
function useMountedEditor(
  containerRef: React.RefObject<HTMLDivElement | null>,
  editorRef: React.RefObject<MonacoApi.editor.IStandaloneCodeEditor | null>,
  monacoRef: React.RefObject<typeof MonacoApi | null>,
  setStatus: (status: EditorStatus) => void
): void {
  useEffect(() => {
    let isCancelled = false;

    void import('./monaco-setup.js')
      .then(({ monaco }) => {
        if (isCancelled || containerRef.current === null) return;

        monacoRef.current = monaco;
        setLoadedMonaco(monaco);
        // Nace con el tema y las settings ya aplicados en vez de parpadear con
        // los valores de fábrica y corregirse un tick después.
        const { editor: initial } = useSettingsStore.getState().settings;

        editorRef.current = monaco.editor.create(containerRef.current, {
          automaticLayout: true,
          scrollBeyondLastLine: false,
          theme: monacoThemeFor(currentResolvedTheme()),
          fontSize: initial.fontSize,
          fontFamily: initial.fontFamily,
          wordWrap: initial.wordWrap,
          minimap: { enabled: initial.minimap },
          renderWhitespace: initial.renderWhitespace,
        });
        setActiveEditor(editorRef.current);
        setStatus('ready');
      })
      .catch(() => {
        if (!isCancelled) setStatus('failed');
      });

    return () => {
      isCancelled = true;
      // Se desecha el editor pero **no** los modelos: son del registro, que
      // los mantiene vivos mientras la pestaña esté abierta. Desecharlos acá
      // perdería el historial de undo al desmontar el componente.
      setActiveEditor(null);
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [containerRef, editorRef, monacoRef, setStatus]);
}

interface ShowModelOptions {
  editor: MonacoApi.editor.IStandaloneCodeEditor;
  monaco: typeof MonacoApi;
  activePath: string | null;
  shownPathRef: React.RefObject<string | null>;
}

/**
 * Pone en el editor el modelo de la pestaña activa, conservando cursor y
 * scroll de la que se abandona.
 *
 * El undo se conserva solo porque vive en el modelo; el cursor y el scroll no,
 * porque son del editor. De ahí el `saveViewState` / `restoreViewState`.
 */
function showActiveModel(options: ShowModelOptions): void {
  const { editor, monaco, activePath, shownPathRef } = options;
  const previousPath = shownPathRef.current;

  if (activePath === previousPath) return;
  if (previousPath !== null) rememberViewState(previousPath, editor.saveViewState());

  if (activePath === null) {
    editor.setModel(null);
    shownPathRef.current = null;
    return;
  }

  const model = monaco.editor.getModel(monaco.Uri.file(activePath));
  // Todavía no llegó el contenido: el efecto vuelve a correr cuando el
  // registro lo cree.
  if (model === null) return;

  editor.setModel(model);
  editor.restoreViewState(savedViewState(activePath));

  // La sesión restaurada gana sobre el estado de vista guardado en memoria,
  // que en este punto es `null`: es la primera vez que se muestra el modelo.
  const restored = takeRestorePosition(activePath);

  if (restored !== undefined) {
    editor.setPosition({ lineNumber: restored.line, column: restored.column });
    // `revealLine` en vez de `setScrollTop`: el scroll en píxeles depende del
    // alto de línea, y el alto de línea depende del tamaño de fuente, que es
    // un setting. Guardar la línea y dejar que Monaco calcule el píxel es lo
    // que hace que la sesión sobreviva a cambiar `editor.fontSize`.
    editor.revealLineNearTop(restored.scrollTopLine);
  }

  shownPathRef.current = activePath;
}
