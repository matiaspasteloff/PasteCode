import type { SerializedError, TerminalSession } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/**
 * Una terminal, desde el punto de vista de la UI.
 *
 * **El slot existe antes que el proceso**, y ésa es la diferencia con la
 * versión anterior de este store. Antes, la sesión se creaba con un `80×24`
 * escrito a mano y después xterm medía el panel y mandaba el tamaño real; el
 * resize posterior hacía que conpty **reprodujera su buffer** reflotado, y eso
 * es lo que dejaba el prompt de PSReadLine redibujado encima de sí mismo con
 * una hilera de `>>>>>>>`.
 *
 * Con el slot, el orden se invierte: se monta xterm, se mide, y recién ahí se
 * pide la sesión con las columnas y las filas de verdad. Sin resize inicial no
 * hay replay.
 */
export interface TerminalSlot {
  /** Id local. Lo elige el renderer y existe desde antes que el PTY. */
  slotId: string;
  /** La sesión del main, o `null` mientras xterm todavía está midiendo. */
  session: TerminalSession | null;
}

interface TerminalState {
  /** Las terminales abiertas, en el orden en que se abrieron. */
  slots: readonly TerminalSlot[];
  /** La visible, o `null` si no hay ninguna. */
  activeSlotId: string | null;
  /** Si el foco está adentro de una terminal. Publica la clave `terminalFocus`. */
  hasFocus: boolean;
  /** El último error, o `null`. Es lo único que la UI muestra (RNF-25). */
  error: SerializedError | null;

  /**
   * Se asegura de que haya al menos una terminal.
   *
   * Es sincrónico ahora: abrir un slot no toca el disco ni lanza un proceso.
   * El proceso lo pide la superficie cuando terminó de medir.
   */
  ensureSlot: () => void;
  /** Abre una terminal nueva y la deja activa. */
  openSlot: () => void;
  /**
   * Pide el PTY de un slot, con el tamaño que xterm acaba de medir.
   *
   * La llama la superficie y no un comando: es el único que sabe cuántas
   * celdas entran, y saberlo es la mitad del arreglo del `>>>>>>>`.
   */
  attachSession: (slotId: string, dimensions: { cols: number; rows: number }) => Promise<void>;
  /** Cierra una terminal: mata su proceso si llegó a tener uno. */
  close: (slotId: string) => Promise<void>;
  /** Cambia la terminal visible. */
  activate: (slotId: string) => void;
  /** Registra que un proceso murió, venga de donde venga. */
  forget: (sessionId: string) => void;
  setFocus: (hasFocus: boolean) => void;
}

/**
 * Store de las terminales abiertas.
 *
 * El main sigue siendo la fuente de verdad de qué **procesos** existen: es el
 * único que ve morir a uno, y por eso `forget` es una acción propia que llama
 * el evento `terminal:exit`. Lo que este store agrega es la lista de
 * terminales que la persona abrió, que puede tener una entrada sin proceso
 * durante los milisegundos que xterm tarda en medir.
 *
 * @example
 * const slots = useTerminalStore((state) => state.slots);
 */
export const useTerminalStore = create<TerminalState>((set, get) => ({
  slots: [],
  activeSlotId: null,
  hasFocus: false,
  error: null,

  ensureSlot: () => {
    if (get().slots.length === 0) get().openSlot();
  },

  openSlot: () => {
    const slotId = crypto.randomUUID();

    set((state) => ({
      slots: [...state.slots, { slotId, session: null }],
      activeSlotId: slotId,
      error: null,
    }));
  },

  ...sessionActions(set, get),

  activate: (slotId) => {
    set({ activeSlotId: slotId });
  },

  forget: (sessionId) => {
    const slot = get().slots.find((candidate) => candidate.session?.sessionId === sessionId);

    if (slot === undefined) return;

    set((state) => dropSlot(state, slot.slotId));
  },

  setFocus: (hasFocus) => {
    set({ hasFocus });
  },
}));

/**
 * Las acciones que hablan con el main: pedir el PTY y matarlo.
 *
 * Salen del objeto literal por el límite de 50 líneas por función de RNF-20, y
 * la partición no es arbitraria: son las dos únicas que cruzan el IPC. El
 * resto del store es estado local que no puede fallar.
 */
function sessionActions(
  set: SetTerminal,
  get: GetTerminal
): Pick<TerminalState, 'attachSession' | 'close'> {
  return {
    attachSession: async (slotId, dimensions) => {
      // El slot pudo cerrarse mientras xterm medía, y pedir un PTY para una
      // terminal que ya no está sería dejar un shell sin dueño.
      if (!get().slots.some((slot) => slot.slotId === slotId)) return;

      const result = await window.pastecode.invoke('terminal:create', dimensions);

      if (!result.ok) {
        set((state) => ({
          slots: state.slots.filter((slot) => slot.slotId !== slotId),
          error: result.error,
        }));
        return;
      }

      set((state) => ({
        slots: state.slots.map((slot) =>
          slot.slotId === slotId ? { ...slot, session: result.value } : slot
        ),
        error: null,
      }));
    },

    close: async (slotId) => {
      const slot = get().slots.find((candidate) => candidate.slotId === slotId);

      if (slot === undefined) return;

      // Sin proceso no hay nada que matar ni ningún `terminal:exit` que esperar:
      // se saca acá o el slot queda para siempre.
      if (slot.session === null) {
        set((state) => dropSlot(state, slotId));
        return;
      }

      const result = await window.pastecode.invoke('terminal:dispose', {
        sessionId: slot.session.sessionId,
      });

      // No se saca de la lista acá: eso lo hace `forget` cuando llegue
      // `terminal:exit`, que es el momento en que el proceso murió de verdad.
      if (!result.ok) set({ error: result.error });
    },
  };
}

/** El `set` de Zustand, con la forma mínima que usa la fábrica de arriba. */
type SetTerminal = (
  partial: Partial<TerminalState> | ((state: TerminalState) => Partial<TerminalState>)
) => void;

type GetTerminal = () => TerminalState;

/**
 * Saca un slot y elige cuál queda visible.
 *
 * Al cerrar la activa se pasa a la última, que es a donde mira el ojo cuando
 * una pestaña desaparece.
 */
function dropSlot(
  state: TerminalState,
  slotId: string
): Pick<TerminalState, 'slots' | 'activeSlotId'> {
  const slots = state.slots.filter((slot) => slot.slotId !== slotId);

  return {
    slots,
    activeSlotId:
      state.activeSlotId === slotId ? (slots.at(-1)?.slotId ?? null) : state.activeSlotId,
  };
}

/**
 * La sesión de la terminal visible, o `null`.
 *
 * Es el selector que reemplaza al viejo `activeSessionId`: lo que la copia y
 * el pegado necesitan es la **sesión**, y ésa puede no existir todavía.
 *
 * @param state El estado del store.
 * @returns La sesión activa, o `null`.
 * @example
 * const session = selectActiveSession(useTerminalStore.getState());
 */
export function selectActiveSession(state: TerminalState): TerminalSession | null {
  return state.slots.find((slot) => slot.slotId === state.activeSlotId)?.session ?? null;
}
