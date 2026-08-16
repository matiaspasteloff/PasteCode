import type * as MonacoApi from 'monaco-editor/editor/editor.api';
import { useEffect } from 'react';

import { useEditorStatusStore } from '../../stores/editor-status-store.js';

/**
 * Publica la posición del cursor y el lenguaje del modelo activo.
 *
 * **Throttleado a un update por frame.** Monaco dispara
 * `onDidChangeCursorPosition` por cada tecla, por cada movimiento de flecha y
 * varias veces seguidas cuando hay multi-cursor. Escribir en el store en cada
 * uno de esos eventos son varios renders de React por frame para mostrar un
 * número que la pantalla sólo puede dibujar una vez por frame de todos modos.
 *
 * Se agenda con `requestAnimationFrame` y no con un `setTimeout` de 16ms porque
 * es exactamente el reloj correcto: si el navegador no va a pintar, no hay nada
 * que actualizar, y cuando va a pintar se ejecuta justo antes.
 *
 * @param editorRef El editor montado, o `null` mientras carga.
 * @param status Si el editor ya está listo. Vuelve a suscribir cuando lo esté.
 * @param activePath La pestaña activa. Cambia el modelo, y con él el lenguaje.
 * @example
 * useCursorPosition(editorRef, status, activePath);
 */
export function useCursorPosition(
  editorRef: React.RefObject<MonacoApi.editor.IStandaloneCodeEditor | null>,
  status: string,
  activePath: string | null
): void {
  useEffect(() => {
    const editor = editorRef.current;
    const { setPosition, setLanguage, clear } = useEditorStatusStore.getState();

    if (editor === null || status !== 'ready' || activePath === null) {
      clear();
      return undefined;
    }

    let frame: number | null = null;
    let pending: MonacoApi.Position | null = null;

    const publish = (): void => {
      frame = null;

      if (pending !== null) setPosition(pending.lineNumber, pending.column);
    };

    const subscription = editor.onDidChangeCursorPosition((event) => {
      pending = event.position;

      // Si ya hay un frame agendado, este evento se pisa con el anterior: lo
      // que importa es la última posición, no todas las intermedias.
      frame ??= requestAnimationFrame(publish);
    });

    const position = editor.getPosition();

    if (position !== null) setPosition(position.lineNumber, position.column);
    setLanguage(editor.getModel()?.getLanguageId() ?? null);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      subscription.dispose();
    };
  }, [editorRef, status, activePath]);
}
