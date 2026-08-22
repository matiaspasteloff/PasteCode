import type { AiToolCallEvent } from '@pastecode/ipc-contract';

import { applyProposal, reportToolOutcome } from '../features/ai/apply-proposal.js';

import { useEditorStore } from './editor-store.js';

/**
 * Un cambio que el asistente **ya escribió**, con lo que había antes.
 *
 * Es el evento entero y no un subconjunto a propósito: `previousContent` ya
 * viaja adentro de `ai:toolCall`, así que guardarlo tal cual es todo lo que
 * hace falta para poder deshacer. Ésa es la respuesta a la objeción de
 * [ADR-0029](../../../../../docs/adr/0029-asistente-de-ia-en-el-main.md) —que
 * "deshacer" no existe para un archivo que no estaba abierto en el editor—: el
 * contenido anterior no sale del editor, sale del disco y en el momento justo.
 */
export type AppliedEdit = AiToolCallEvent;

/** Lo que este slice del store del asistente sabe. */
export interface AiEditsData {
  /**
   * Los checkpoints del turno, en el orden en que se escribieron.
   *
   * **No se limpian al terminar la respuesta.** `finish` vacía `pending`
   * porque una propuesta sin contestar deja de tener sentido cuando el loop se
   * fue; un cambio ya escrito, en cambio, sigue estando en el disco y tiene
   * que poder revertirse después de leer lo que el asistente contó.
   */
  applied: readonly AppliedEdit[];
  /** Las propuestas de escritura sin responder. */
  pending: readonly AiToolCallEvent[];
}

/** Lo que se hace con una escritura del asistente. */
export interface AiEditActions {
  /** Escribe la propuesta, le contesta al modelo y guarda el checkpoint. */
  applyCall: (call: AiToolCallEvent) => Promise<void>;
  /** Deja un archivo como estaba antes de que el asistente lo tocara. */
  revert: (toolCallId: string) => Promise<void>;
  /** Revierte todo lo del turno, del último al primero. */
  revertAll: () => Promise<void>;
}

/**
 * El `set` y el `get` que estas acciones necesitan, y nada más.
 *
 * Se declaran contra este slice y no contra el `AiState` completo para que
 * este módulo no tenga que importar `ai-store.ts`, que es quien lo importa a
 * él: sería exactamente el ciclo que caza `import-x/no-cycle`
 * ([ADR-0010](../../../../../docs/adr/0010-import-x-no-cycle.md)). El `set` del
 * store real es asignable a éste porque acepta un superconjunto.
 */
type SetEdits = (updater: (state: AiEditsData) => Partial<AiEditsData>) => void;

type GetEdits = () => AiEditsData;

/**
 * Las acciones de escritura y de deshacer del asistente.
 *
 * Es la cuarta fábrica del store del asistente, y vive en un archivo aparte
 * por el techo de 400 líneas de RNF-20: `ai-store.ts` ya estaba en 270.
 *
 * @param set El `set` del store.
 * @param get El `get` del store.
 * @returns Las acciones, listas para esparcir en el store.
 * @example
 * create<AiState>((set, get) => ({ ...editActions(set, get) }));
 */
export function editActions(set: SetEdits, get: GetEdits): AiEditActions {
  const forget = (toolCallId: string): void => {
    set((state) => ({
      applied: state.applied.filter((edit) => edit.toolCallId !== toolCallId),
    }));
  };

  return {
    applyCall: async (call) => {
      set((state) => ({
        pending: state.pending.filter((one) => one.toolCallId !== call.toolCallId),
      }));

      const { outcome, detail } = await applyProposal(call);

      // El checkpoint se guarda **sólo** si se escribió: uno que apunta a una
      // escritura que falló ofrecería revertir un archivo que no cambió, y
      // revertirlo lo dejaría con el contenido que el modelo quiso escribir.
      if (outcome === 'applied') set((state) => ({ applied: [...state.applied, call] }));

      await reportToolOutcome(call, outcome, detail);
    },

    revert: async (toolCallId) => {
      const edit = get().applied.find((candidate) => candidate.toolCallId === toolCallId);

      if (edit === undefined) return;

      if (await undo(edit)) forget(toolCallId);
    },

    revertAll: async () => {
      // Del último al primero: dos ediciones sobre el mismo archivo se
      // deshacen en orden inverso o la primera pisa a la segunda.
      for (const edit of [...get().applied].reverse()) {
        if (await undo(edit)) forget(edit.toolCallId);
      }
    },
  };
}

/**
 * Deja el archivo como estaba antes de esta edición.
 *
 * Un archivo que el asistente **creó** se manda a la papelera con `fs:delete`,
 * que usa `shell.trashItem`: revertir una creación no puede ser un borrado sin
 * vuelta atrás, y ésa es justamente la razón por la que el canal existe.
 *
 * @returns `true` si se pudo deshacer.
 */
async function undo(edit: AppliedEdit): Promise<boolean> {
  if (edit.previousContent === null) {
    return (await window.pastecode.invoke('fs:delete', { path: edit.path })).ok;
  }

  const written = await window.pastecode.invoke('fs:writeFile', {
    path: edit.path,
    content: edit.previousContent,
  });

  if (!written.ok) return false;

  // Misma adopción que al escribir, y por el mismo `noteOwnWrite`: sin esto la
  // pestaña abierta sigue mostrando lo que el asistente había puesto.
  useEditorStore
    .getState()
    .adoptExternalWrite(edit.path, edit.previousContent, written.value.mtimeMs);

  return true;
}
