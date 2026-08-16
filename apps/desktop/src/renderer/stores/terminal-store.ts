import type { SerializedError, TerminalSession } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Estado de las terminales tal como lo ve la UI. */
interface TerminalState {
  /** Las sesiones vivas, en el orden en que se abrieron. */
  sessions: TerminalSession[];
  /** La sesión visible, o `null` si no hay ninguna. */
  activeSessionId: string | null;
  /** Si el panel está abierto. Independiente de si hay sesiones. */
  isPanelOpen: boolean;
  /** Si el foco está adentro de una terminal. Publica la clave `terminalFocus`. */
  hasFocus: boolean;
  /** El último error, o `null`. Es lo único que la UI muestra (RNF-25). */
  error: SerializedError | null;

  /** Abre el panel, creando una sesión si no había ninguna. */
  openPanel: () => Promise<void>;
  /** Cierra el panel. Las sesiones siguen vivas. */
  closePanel: () => void;
  /** Crea una sesión nueva y la deja activa. */
  create: (dimensions: { cols: number; rows: number }) => Promise<void>;
  /** Cierra una sesión: mata su proceso. */
  dispose: (sessionId: string) => Promise<void>;
  /** Cambia la sesión visible. */
  activate: (sessionId: string) => void;
  /** Registra que una sesión murió, venga de donde venga. */
  forget: (sessionId: string) => void;
  setFocus: (hasFocus: boolean) => void;
}

/** Tamaño con el que se crea una sesión antes de que xterm mida el panel. */
const INITIAL_DIMENSIONS = { cols: 80, rows: 24 };

/**
 * Store de las terminales abiertas.
 *
 * El main es la fuente de verdad de qué sesiones existen: es el único que ve
 * morir a un proceso. Este store es una réplica para pintar, y por eso `forget`
 * existe como acción propia —lo llama el evento `terminal:exit`, que puede
 * llegar sin que nadie haya pedido cerrar nada, por ejemplo cuando el usuario
 * escribe `exit` adentro del shell—.
 *
 * @example
 * const sessions = useTerminalStore((state) => state.sessions);
 */
export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isPanelOpen: false,
  hasFocus: false,
  error: null,

  openPanel: async () => {
    set({ isPanelOpen: true });

    if (get().sessions.length === 0) await get().create(INITIAL_DIMENSIONS);
  },

  closePanel: () => {
    // Cerrar el panel no mata nada: un `npm run dev` corriendo tiene que
    // seguir corriendo aunque no se lo esté mirando.
    set({ isPanelOpen: false, hasFocus: false });
  },

  create: async (dimensions) => {
    const result = await window.pastecode.invoke('terminal:create', dimensions);

    if (!result.ok) {
      set({ error: result.error });
      return;
    }

    set((state) => ({
      sessions: [...state.sessions, result.value],
      activeSessionId: result.value.sessionId,
      error: null,
    }));
  },

  dispose: async (sessionId) => {
    const result = await window.pastecode.invoke('terminal:dispose', { sessionId });

    // No se saca de la lista acá: eso lo hace `forget` cuando llegue
    // `terminal:exit`, que es el momento en que el proceso murió de verdad.
    if (!result.ok) set({ error: result.error });
  },

  activate: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  forget: (sessionId) => {
    set((state) => {
      const sessions = state.sessions.filter((session) => session.sessionId !== sessionId);
      const wasActive = state.activeSessionId === sessionId;

      return {
        sessions,
        // Al cerrar la activa se pasa a la última, que es a donde mira el ojo
        // cuando una pestaña desaparece.
        activeSessionId: wasActive
          ? (sessions.at(-1)?.sessionId ?? null)
          : state.activeSessionId,
      };
    });
  },

  setFocus: (hasFocus) => {
    set({ hasFocus });
  },
}));
