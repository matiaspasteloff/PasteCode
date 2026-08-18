import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Un archivo con trabajo sin guardar que sobrevivió a un cierre. */
interface RecoverableBackup {
  path: string;
  content: string;
  savedAt: number;
}

/** Lo que la UI necesita para ofrecer la recuperación de RNF-08. */
interface RecoveryState {
  /** Lo recuperable. Vacío mientras no haya nada que ofrecer. */
  pending: readonly RecoverableBackup[];
  error: SerializedError | null;
  /** Pregunta al main qué quedó de la sesión anterior. */
  load: () => Promise<void>;
  /** Descarta todo sin restaurar nada. */
  dismiss: () => Promise<void>;
  /** Saca uno de la lista una vez restaurado, y borra su respaldo. */
  markRestored: (path: string) => Promise<void>;
}

/**
 * Store de la recuperación tras un cierre inesperado (RNF-08).
 *
 * Es un store aparte y no un campo del editor a propósito: vive **antes** que
 * el editor —se pregunta al arrancar, con la app todavía vacía— y su ciclo de
 * vida termina apenas se decide qué hacer. Meterlo en el store del editor lo
 * ataría a un archivo abierto que en ese momento no existe.
 *
 * @example
 * const pending = useRecoveryStore((state) => state.pending);
 */
export const useRecoveryStore = create<RecoveryState>((set, get) => ({
  pending: [],
  error: null,

  load: async () => {
    const result = await window.pastecode.invoke('backups:pending', {});

    if (!result.ok) {
      // Que falle no puede impedir arrancar: sin recuperación se pierde el
      // trabajo de la última media hora, pero con la app trabada se pierde todo.
      set({ error: result.error });
      return;
    }

    set({ pending: result.value.backups, error: null });
  },

  dismiss: async () => {
    set({ pending: [] });

    // Sin borrarlos, el mismo diálogo volvería en cada arranque para siempre.
    await window.pastecode.invoke('backups:discard', {});
  },

  markRestored: async (path) => {
    set({ pending: get().pending.filter((backup) => backup.path !== path) });

    await window.pastecode.invoke('backups:discard', { path });
  },
}));
