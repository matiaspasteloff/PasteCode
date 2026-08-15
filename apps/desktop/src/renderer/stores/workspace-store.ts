import type { SerializedError, WorkspaceInfo } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Estado del workspace tal como lo ve la UI. */
interface WorkspaceState {
  /** El workspace abierto, o `null` si no hay ninguno. */
  workspace: WorkspaceInfo | null;
  /** Si hay una operación de apertura en curso. */
  isOpening: boolean;
  /** El último error, o `null`. Es lo que la UI muestra (RNF-25). */
  error: SerializedError | null;
  /** Abre el diálogo nativo y guarda el resultado. Cancelar no es un error. */
  open: () => Promise<void>;
  /** Sincroniza con el workspace que el main ya tenía abierto. */
  restore: () => Promise<void>;
}

/**
 * Store del workspace abierto.
 *
 * Chico y por dominio, que es la forma que fija
 * [ADR-0004](../../../../../docs/adr/0004-zustand-para-el-estado-del-renderer.md).
 * El estado que la UI necesita —el workspace, si está cargando y el último
 * error— vive junto a las acciones que lo cambian, así que no hay un componente
 * intermedio cuya única tarea sea pasar props hacia abajo.
 *
 * @example
 * const workspace = useWorkspaceStore((state) => state.workspace);
 * const open = useWorkspaceStore((state) => state.open);
 */
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  isOpening: false,
  error: null,

  open: async () => {
    set({ isOpening: true, error: null });

    const result = await window.pastecode.invoke('workspace:open', {});

    // Cancelar el diálogo devuelve `ok: true` con valor `null`: es una
    // respuesta válida, no un fallo, y no tiene que dejar el estado en error
    // ni borrar el workspace que ya estaba abierto.
    if (!result.ok) set({ isOpening: false, error: result.error });
    else if (result.value !== null) set({ isOpening: false, workspace: result.value });
    else set({ isOpening: false });
  },

  restore: async () => {
    const result = await window.pastecode.invoke('workspace:getRoot', {});

    if (result.ok) set({ workspace: result.value });
    else set({ error: result.error });
  },
}));
