import { create } from 'zustand';

/**
 * Las vistas de la barra lateral.
 *
 * Es un array `as const` y no un enum de TypeScript
 * ([regla 5 de codigo.md](../../../../../docs/convenciones/codigo.md#5-nada-de-enums-de-typescript)):
 * la unión sale del array, así que la lista de vistas es un dato que se puede
 * recorrer y no un tipo que sólo existe en tiempo de compilación.
 */
export const SIDE_VIEWS = ['explorer', 'search'] as const;

export type SideView = (typeof SIDE_VIEWS)[number];

interface ViewState {
  /** La vista lateral visible, o `null` si la barra está colapsada. */
  sideView: SideView | null;
  /** Muestra una vista. Si ya estaba visible, no hace nada. */
  showSide: (view: SideView) => void;
  /**
   * Muestra la vista, o colapsa la barra si esa vista ya estaba visible.
   *
   * Es lo que hace que el mismo atajo sirva para ir y para volver, que es lo
   * que la gente espera de `Ctrl+Shift+F` y de un click en el rail.
   */
  toggleSide: (view: SideView) => void;
}

/**
 * Qué vista está a la vista, en la barra lateral.
 *
 * Antes esto era un booleano `isPanelOpen` adentro de `search-store`: ruteo de
 * vistas viviendo en el store de una feature. Andaba con dos vistas y no
 * sobrevive a una tercera —¿el booleano de quién gana cuando Git también quiere
 * estar abierto?—, y además obligaba a que el contenedor de la barra lateral
 * importara el store de búsqueda para saber qué dibujar.
 *
 * Ver [ADR-0022](../../../../../docs/adr/0022-cascaron-con-barra-de-actividades.md).
 *
 * @example
 * const view = useViewStore((state) => state.sideView);
 */
export const useViewStore = create<ViewState>((set, get) => ({
  // El explorador arranca abierto: es lo primero que alguien quiere ver al
  // abrir una carpeta, y arrancar colapsado obliga a un click antes de nada.
  sideView: 'explorer',

  showSide: (view) => {
    set({ sideView: view });
  },

  toggleSide: (view) => {
    set({ sideView: get().sideView === view ? null : view });
  },
}));
