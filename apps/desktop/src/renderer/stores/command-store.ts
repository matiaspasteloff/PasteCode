import type { Command } from '@pastecode/core';
import { CommandRegistry } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

interface CommandState {
  /** El registro. Su contenido no dispara re-renders; ver la nota de abajo. */
  registry: CommandRegistry;
  /** Cambia cada vez que se registra o se da de baja algo. */
  revision: number;
  isPaletteOpen: boolean;
  /** El último error de un comando, o `null`. */
  error: SerializedError | null;

  register: (command: Command) => void;
  unregister: (id: string) => void;
  openPalette: () => void;
  closePalette: () => void;
  run: (id: string, ...args: unknown[]) => Promise<void>;
}

/**
 * Store de los comandos y de la paleta.
 *
 * El registro es una instancia mutable y no un array en el estado: es lo que
 * la Etapa 5 necesita para poder dar de baja de una todos los comandos de una
 * extensión que se descarga. Como mutarlo no cambia su identidad, Zustand no
 * se enteraría, así que `revision` es lo que le avisa a la UI que la lista
 * cambió. Es explícito a propósito — la alternativa, copiar el array entero en
 * cada registro, escondería que el registro es mutable.
 *
 * @example
 * const registry = useCommandStore((state) => state.registry);
 */
export const useCommandStore = create<CommandState>((set, get) => ({
  registry: new CommandRegistry(),
  revision: 0,
  isPaletteOpen: false,
  error: null,

  register: (command) => {
    get().registry.register(command);
    set({ revision: get().revision + 1 });
  },

  unregister: (id) => {
    get().registry.unregister(id);
    set({ revision: get().revision + 1 });
  },

  openPalette: () => {
    set({ isPaletteOpen: true });
  },

  closePalette: () => {
    set({ isPaletteOpen: false });
  },

  run: async (id, ...args) => {
    const failure = await get().registry.execute(id, ...args);

    // El registro captura lo que lance el handler y lo devuelve: un comando
    // roto deja un mensaje en pantalla, no una app caída.
    set({
      error:
        failure === undefined ? null : { code: failure.code, userMessage: failure.userMessage },
    });
  },
}));
