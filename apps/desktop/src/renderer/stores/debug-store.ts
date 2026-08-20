import type { Breakpoint } from '@pastecode/core';
import { toggleBreakpoint } from '@pastecode/core';
import { create } from 'zustand';

interface DebugState {
  /** Todos los del workspace, de todos los archivos. */
  breakpoints: Breakpoint[];

  /** Pone o saca el de una línea. Es lo que hace un click en el gutter. */
  toggle: (path: string, line: number) => void;
  /** Reemplaza la lista entera. Lo usa la restauración de la sesión. */
  setBreakpoints: (breakpoints: readonly Breakpoint[]) => void;
  /** Saca todos. Se usa al cambiar de workspace. */
  clear: () => void;
}

/**
 * Estado del debugging en el renderer.
 *
 * **Los breakpoints viven acá y no en el editor.** Sobreviven a cerrar la
 * pestaña —un breakpoint en un archivo que no está abierto sigue existiendo— y
 * se persisten con la sesión ([RF-502](../../../../../docs/03-requerimientos-funcionales.md)),
 * así que atarlos al modelo de Monaco los perdería en cuanto el registro
 * libere ese modelo.
 *
 * La lógica de poner y sacar está en `packages/core`: es aritmética sobre una
 * lista y se testea sin montar nada.
 *
 * @example
 * const breakpoints = useDebugStore((state) => state.breakpoints);
 */
export const useDebugStore = create<DebugState>((set, get) => ({
  breakpoints: [],

  toggle: (path, line) => {
    set({ breakpoints: toggleBreakpoint(get().breakpoints, path, line) });
  },

  setBreakpoints: (breakpoints) => {
    set({ breakpoints: [...breakpoints] });
  },

  clear: () => {
    set({ breakpoints: [] });
  },
}));
