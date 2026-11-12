import type { UpdateState } from '@pastecode/core';
import { create } from 'zustand';

interface UpdateStoreState {
  /** El estado del main, o `null` hasta que llega el primero. */
  state: UpdateState | null;
  /**
   * Si la persona pidió buscar en esta sesión. Decide qué se muestra: el
   * resultado de un chequeo que nadie pidió (`up-to-date`, `unsupported`, un
   * error de red al arrancar) no tiene nada que decir, y el de uno pedido sí.
   */
  requested: boolean;

  setState: (state: UpdateState) => void;
  markRequested: () => void;
}

/**
 * El estado de las actualizaciones en el renderer.
 *
 * Es un espejo: la fuente de verdad es el servicio del main, que empuja cada
 * cambio por `update:stateChanged`. Acá no se decide nada; los comandos de
 * `update-commands.ts` piden y el main contesta.
 *
 * @example
 * const update = useUpdateStore((store) => store.state);
 */
export const useUpdateStore = create<UpdateStoreState>((set) => ({
  state: null,
  requested: false,

  setState: (state) => {
    set({ state });
  },

  markRequested: () => {
    set({ requested: true });
  },
}));
