import type { AiMessage, AiModel } from '@pastecode/core';
import type { AiToolCallEvent, SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Una propuesta de escritura esperando que alguien la mire. */
export type PendingToolCall = AiToolCallEvent;

/** Qué se le contesta a una propuesta. */
export type ToolOutcome = 'applied' | 'discarded' | 'failed';

/** Lo que sabe el store, sin las acciones. */
interface AiData {
  /** Los modelos gratuitos, ya filtrados por el main. */
  models: readonly AiModel[];
  /** El elegido, o `null` si todavía no se cargó la lista. */
  modelId: string | null;
  /** La conversación **cerrada**: lo que ya terminó de escribirse. */
  messages: readonly AiMessage[];
  /**
   * Lo que se está escribiendo ahora.
   *
   * Va aparte de `messages` a propósito: mientras llega, cada delta cambiaría
   * el último elemento del array, y eso hace que React reconcilie la lista
   * entera en cada token. Separado, sólo se repinta el mensaje en vuelo.
   */
  streamingText: string;
  /** La pregunta en curso, o `null`. Es el `requestId` del contrato. */
  requestId: string | null;
  /** Las propuestas de escritura sin responder. */
  pending: readonly PendingToolCall[];
  hasKey: boolean;
  /** Si este sistema puede guardar la clave cifrada. */
  canPersist: boolean;
  isKeyDialogOpen: boolean;
  error: SerializedError | null;
}

/** Lo que se hace con la clave de API. */
interface AiCredentialActions {
  refreshKeyStatus: () => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  openKeyDialog: () => void;
  closeKeyDialog: () => void;
  loadModels: () => Promise<void>;
  selectModel: (modelId: string) => void;
}

/** Lo que la persona hace con la conversación. */
interface AiConversationActions {
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  newChat: () => void;
  /** Contesta una propuesta y la saca de la lista. */
  answerToolCall: (toolCallId: string, outcome: ToolOutcome, detail: string) => Promise<void>;
}

/**
 * Lo que aplican los eventos del main.
 *
 * Va aparte de `AiConversationActions` porque son dos cosas distintas: éstas
 * las dispara `use-ai-events` con lo que llega del main, y aquéllas las
 * dispara una persona. Que estén separadas hace evidente cuáles se pueden
 * llamar desde un componente.
 */
interface AiStreamActions {
  /** Aplica un `ai:delta`. Descarta lo que no sea de la pregunta en curso. */
  appendDelta: (requestId: string, text: string) => void;
  /** Aplica un `ai:toolCall`: una propuesta más para confirmar. */
  addPending: (call: PendingToolCall) => void;
  /** Aplica un `ai:done`: cierra el mensaje en vuelo. */
  finish: (requestId: string, error: SerializedError | null) => void;
}

type AiState = AiData & AiCredentialActions & AiConversationActions & AiStreamActions;

/** El `set` de Zustand, con la forma mínima que usan las fábricas de abajo. */
type SetAi = (partial: Partial<AiState> | ((state: AiState) => Partial<AiState>)) => void;

type GetAi = () => AiState;

/** El estado del que se parte, y al que vuelve una conversación nueva. */
const EMPTY_CONVERSATION = {
  messages: [],
  streamingText: '',
  pending: [],
  error: null,
} satisfies Partial<AiData>;

/**
 * Store del asistente.
 *
 * **El renderer es dueño de la conversación y el main es dueño de la
 * conexión.** La conversación entera viaja en cada `ai:chat` y el main no
 * guarda historial: sin estado compartido entre procesos no hay estado que se
 * pueda desincronizar, que es el mismo criterio con el que las terminales
 * viven al revés —ahí el dueño es el main, porque es el único que ve morir un
 * proceso—.
 *
 * Las acciones salen de dos fábricas y no de un objeto literal por el límite
 * de 50 líneas por función de RNF-20. La partición no es arbitraria: la clave
 * y la conversación son dos dominios que no se tocan.
 *
 * @example
 * const messages = useAiStore((state) => state.messages);
 */
export const useAiStore = create<AiState>((set, get) => ({
  models: [],
  modelId: null,
  requestId: null,
  hasKey: false,
  canPersist: false,
  isKeyDialogOpen: false,
  ...EMPTY_CONVERSATION,
  ...credentialActions(set, get),
  ...conversationActions(set, get),
  ...streamActions(set, get),
}));

/** Las acciones de la clave y del catálogo de modelos. */
function credentialActions(set: SetAi, get: GetAi): AiCredentialActions {
  return {
    loadModels: async () => {
      const result = await window.pastecode.invoke('ai:listModels', {});

      if (!result.ok) {
        set({ error: result.error });
        return;
      }

      set((state) => ({
        models: result.value.models,
        // Se conserva el elegido si sigue existiendo: el catálogo gratuito
        // cambia sin aviso, y un modelo que desapareció no puede dejar el
        // selector apuntando a algo que ya no se puede pedir.
        modelId:
          result.value.models.find((model) => model.id === state.modelId)?.id ??
          result.value.models[0]?.id ??
          null,
        error: null,
      }));
    },

    refreshKeyStatus: async () => {
      const result = await window.pastecode.invoke('ai:getKeyStatus', {});

      if (result.ok) set({ hasKey: result.value.hasKey, canPersist: result.value.canPersist });
    },

    setApiKey: async (apiKey) => {
      const result = await window.pastecode.invoke('ai:setApiKey', { apiKey });

      if (!result.ok) {
        set({ error: result.error });
        return;
      }

      set({ hasKey: true, isKeyDialogOpen: false, error: null });
      await get().loadModels();
    },

    clearApiKey: async () => {
      await window.pastecode.invoke('ai:clearApiKey', {});
      set({ hasKey: false, models: [], modelId: null });
    },

    openKeyDialog: () => {
      set({ isKeyDialogOpen: true });
    },

    closeKeyDialog: () => {
      set({ isKeyDialogOpen: false });
    },

    selectModel: (modelId) => {
      set({ modelId });
    },
  };
}

/** Las acciones que dispara una persona sobre la conversación. */
function conversationActions(set: SetAi, get: GetAi): AiConversationActions {
  return {
    send: async (text) => {
      const { modelId, messages, requestId } = get();

      // Sin modelo no hay a quién preguntarle, y con una respuesta en curso
      // mandar otra dejaría dos streams pintando sobre el mismo lugar.
      if (modelId === null || text.trim() === '' || requestId !== null) return;

      const next = [...messages, { role: 'user' as const, content: text }];
      const id = crypto.randomUUID();

      set({ messages: next, requestId: id, streamingText: '', error: null });

      const result = await window.pastecode.invoke('ai:chat', {
        requestId: id,
        model: modelId,
        messages: next,
      });

      // El canal sólo dice si arrancó. El final llega por `ai:done`, así que
      // un fallo acá tiene que cerrar la pregunta a mano o queda colgada.
      if (!result.ok) set({ error: result.error, requestId: null });
    },

    cancel: async () => {
      const { requestId } = get();

      if (requestId === null) return;

      await window.pastecode.invoke('ai:cancel', { requestId });
    },

    newChat: () => {
      set(EMPTY_CONVERSATION);
    },

    answerToolCall: async (toolCallId, outcome, detail) => {
      const call = get().pending.find((candidate) => candidate.toolCallId === toolCallId);

      if (call === undefined) return;

      set((state) => ({
        pending: state.pending.filter((candidate) => candidate.toolCallId !== toolCallId),
      }));

      await window.pastecode.invoke('ai:toolResult', {
        requestId: call.requestId,
        toolCallId,
        outcome,
        detail,
      });
    },
  };
}

/** Las acciones que aplican lo que llega por `ai:delta`, `ai:toolCall` y `ai:done`. */
function streamActions(set: SetAi, get: GetAi): AiStreamActions {
  return {
    appendDelta: (requestId, text) => {
      // Un delta de una pregunta que ya no es la actual se tira: entre que se
      // cancela y que el `fetch` se aborta, el servidor sigue escribiendo.
      if (get().requestId !== requestId) return;

      set((state) => ({ streamingText: state.streamingText + text }));
    },

    addPending: (call) => {
      if (get().requestId !== call.requestId) return;

      set((state) => ({ pending: [...state.pending, call] }));
    },

    finish: (requestId, error) => {
      if (get().requestId !== requestId) return;

      set((state) => ({
        // Lo que se alcanzó a escribir se conserva aunque haya fallado: una
        // respuesta cortada a la mitad sigue siendo lo que la persona leyó.
        messages:
          state.streamingText === ''
            ? state.messages
            : [...state.messages, { role: 'assistant', content: state.streamingText }],
        streamingText: '',
        requestId: null,
        pending: [],
        error,
      }));
    },
  };
}
