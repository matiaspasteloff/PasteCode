import type {
  ExtensionContributionsEvent,
  ExtensionHostChangedEvent,
  ExtensionsChangedEvent,
} from '@pastecode/ipc-contract';
import { create } from 'zustand';

interface ExtensionsState {
  /** El estado del host supervisado. */
  host: ExtensionHostChangedEvent;
  /** Lo que hay cargado, con las que fallaron y su motivo. */
  extensions: ExtensionsChangedEvent['extensions'];
  /** Los ítems de la status bar aportados, ya ordenados por prioridad. */
  statusItems: ExtensionContributionsEvent['statusItems'];
  /** Los temas aportados, listos para aplicar. */
  themes: ExtensionsChangedEvent['themes'];

  setHost: (host: ExtensionHostChangedEvent) => void;
  setExtensions: (extensions: ExtensionsChangedEvent['extensions']) => void;
  setThemes: (themes: ExtensionsChangedEvent['themes']) => void;
  setStatusItems: (items: ExtensionContributionsEvent['statusItems']) => void;
}

/**
 * Estado de las extensiones en el renderer.
 *
 * **Los comandos no están acá.** Van al `CommandRegistry` del
 * [command-store](./command-store.ts), que es donde ya viven todos los demás:
 * un comando de extensión tiene que aparecer en la paleta al lado de los de
 * fábrica, y una segunda lista obligaría a la paleta a buscar en dos lados. El
 * JSDoc de ese store ya decía que el registro es mutable justamente para poder
 * dar de baja de una todos los comandos de una extensión que se descarga.
 *
 * Lo que sí vive acá es lo que sólo las extensiones aportan: su estado, y los
 * ítems de la barra.
 *
 * @example
 * const items = useExtensionsStore((state) => state.statusItems);
 */
export const useExtensionsStore = create<ExtensionsState>((set) => ({
  host: { state: 'starting', pid: null, restarts: 0 },
  extensions: [],
  statusItems: [],
  themes: [],

  setHost: (host) => {
    set({ host });
  },

  setExtensions: (extensions) => {
    set({ extensions });
  },

  setThemes: (themes) => {
    set({ themes });
  },

  setStatusItems: (statusItems) => {
    set({ statusItems });
  },
}));
