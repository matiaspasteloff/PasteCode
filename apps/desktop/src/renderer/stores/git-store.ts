import type { GitRepository, SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

interface GitState {
  /**
   * El repositorio abierto, o `null`.
   *
   * `null` es "no hay git, o está apagado, o esta carpeta no es un
   * repositorio". Los tres se ven igual: el icono del rail y el indicador de
   * rama no se dibujan. Distinguirlos sería pedirle a la persona que le importe
   * una diferencia que no puede accionar.
   */
  repository: GitRepository | null;
  /** El mensaje que se está escribiendo. Vive acá para sobrevivir a cerrar el panel. */
  commitMessage: string;
  /** Si hay una operación en curso. Es el feedback de progreso de RNF-24. */
  isBusy: boolean;
  error: SerializedError | null;
  /** Las ramas locales, cargadas cuando alguien abre el selector. */
  branches: readonly string[];
  isBranchPickerOpen: boolean;

  /** Aplica lo que llegó por `git:changed` o por `git:getStatus`. */
  setRepository: (repository: GitRepository | null) => void;
  setCommitMessage: (message: string) => void;
  refresh: () => Promise<void>;
  stage: (paths: readonly string[]) => Promise<void>;
  unstage: (paths: readonly string[]) => Promise<void>;
  commit: () => Promise<void>;
  openBranchPicker: () => Promise<void>;
  closeBranchPicker: () => void;
  checkout: (branch: string) => Promise<void>;
}

/**
 * El estado del repositorio, en el renderer.
 *
 * Es un store aparte del editor por lo mismo que `problems-store`: el estado de
 * Git se refresca cada vez que alguien guarda, y si viviera en `editor-store`
 * cada refresco repintaría las pestañas y el árbol.
 *
 * **Nada de esto se recalcula al tipear.** El estado de git no cambia hasta que
 * algo toca el disco, y el refresco lo dispara el main —watcher o una operación
 * propia— y llega por `git:changed`.
 *
 * @example
 * const repository = useGitStore((state) => state.repository);
 */
export const useGitStore = create<GitState>((set, get) => ({
  repository: null,
  commitMessage: '',
  isBusy: false,
  error: null,
  branches: [],
  isBranchPickerOpen: false,

  setRepository: (repository) => {
    set({ repository });
  },

  setCommitMessage: (commitMessage) => {
    set({ commitMessage });
  },

  refresh: async () => {
    const result = await window.pastecode.invoke('git:getStatus', {});

    if (result.ok) set({ repository: result.value.repository });
  },

  stage: async (paths) => {
    await run(set, () => window.pastecode.invoke('git:stage', { paths: [...paths] }));
  },

  unstage: async (paths) => {
    await run(set, () => window.pastecode.invoke('git:unstage', { paths: [...paths] }));
  },

  commit: async () => {
    const message = get().commitMessage.trim();

    if (message === '') return;

    const ok = await run(set, () => window.pastecode.invoke('git:commit', { message }));

    // El mensaje se limpia **sólo si el commit salió bien**. Perderlo cuando un
    // hook lo rechaza sería hacerle reescribir el mensaje a alguien que ya lo
    // había escrito, que es la peor forma de reportar un error.
    if (ok) set({ commitMessage: '' });
  },

  openBranchPicker: async () => {
    const result = await window.pastecode.invoke('git:listBranches', {});

    if (!result.ok) {
      set({ error: result.error });
      return;
    }

    set({ branches: result.value.branches, isBranchPickerOpen: true, error: null });
  },

  closeBranchPicker: () => {
    set({ isBranchPickerOpen: false });
  },

  checkout: async (branch) => {
    set({ isBranchPickerOpen: false });
    await run(set, () => window.pastecode.invoke('git:checkoutBranch', { branch }));
  },
}));

/** El `set` de Zustand, con lo justo que estas funciones necesitan. */
type SetGitState = (partial: Partial<GitState>) => void;

/**
 * Corre una operación marcando el progreso y guardando el error.
 *
 * El estado nuevo **no se pide acá**: la operación ya hizo que el main agende
 * un refresco, y llega solo por `git:changed`. Pedirlo también sería correr
 * `git status` dos veces por cada click.
 *
 * @returns `true` si salió bien.
 */
async function run(
  set: SetGitState,
  operation: () => Promise<{ ok: true } | { ok: false; error: SerializedError }>
): Promise<boolean> {
  set({ isBusy: true, error: null });

  const result = await operation();

  set({ isBusy: false, error: result.ok ? null : result.error });

  return result.ok;
}
