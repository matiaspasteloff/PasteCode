import { create } from 'zustand';

/** Lo que la barra de estado sabe del editor activo. */
interface EditorStatusState {
  /** Línea del cursor, base 1. `null` si no hay ningún archivo abierto. */
  line: number | null;
  /** Columna del cursor, base 1. */
  column: number | null;
  /** El lenguaje que Monaco le asignó al modelo activo. */
  languageId: string | null;
  /** Publica la posición del cursor. La llama el editor, ya throttleada. */
  setPosition: (line: number, column: number) => void;
  setLanguage: (languageId: string | null) => void;
  /** Limpia todo. Se llama al quedarse sin pestañas. */
  clear: () => void;
}

/**
 * Lo que la barra de estado necesita del editor.
 *
 * Existe para que **la posición del cursor no re-renderice la aplicación**.
 * `Ln, Col` cambia con cada tecla y con cada movimiento de flecha; si viviera en
 * `editor-store`, cada pulsación repintaría las pestañas, el árbol y todo lo
 * que lee ese store, y el presupuesto de 16ms de
 * [RNF-02](../../../../../docs/04-requerimientos-no-funcionales.md#performance)
 * se iría en dibujar cosas que no cambiaron.
 *
 * Con un store aparte, quien se suscribe es un `<span>` de doce caracteres. El
 * throttle a un update por frame lo pone el editor, que es quien conoce el
 * ritmo del evento; ver `use-cursor-position.ts`.
 *
 * @example
 * const line = useEditorStatusStore((state) => state.line);
 */
export const useEditorStatusStore = create<EditorStatusState>((set) => ({
  line: null,
  column: null,
  languageId: null,

  setPosition: (line, column) => {
    set({ line, column });
  },

  setLanguage: (languageId) => {
    set({ languageId });
  },

  clear: () => {
    set({ line: null, column: null, languageId: null });
  },
}));
