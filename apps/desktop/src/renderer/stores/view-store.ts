import { create } from 'zustand';

/**
 * Las vistas de la barra lateral.
 *
 * Es un array `as const` y no un enum de TypeScript
 * ([regla 5 de codigo.md](../../../../../docs/convenciones/codigo.md#5-nada-de-enums-de-typescript)):
 * la unión sale del array, así que la lista de vistas es un dato que se puede
 * recorrer y no un tipo que sólo existe en tiempo de compilación.
 */
export const SIDE_VIEWS = ['explorer', 'search', 'git'] as const;

export type SideView = (typeof SIDE_VIEWS)[number];

/** Las vistas del panel inferior. Mismo criterio que `SIDE_VIEWS`. */
export const PANEL_VIEWS = ['terminal', 'problems', 'debug'] as const;

export type PanelView = (typeof PANEL_VIEWS)[number];

/**
 * Las vistas del panel **auxiliar**, el de la derecha. Mismo criterio de array
 * `as const` que las otras dos.
 *
 * Hoy hay una sola, y aun así es una lista: el asistente vivía como cuarta
 * entrada de `SIDE_VIEWS` y competía por la misma columna que el explorador,
 * la búsqueda y Git, que son las tres cosas que uno quiere ver **mientras** le
 * habla al asistente. Un eje propio a la derecha es lo que las deja convivir,
 * y modelarlo como lista desde el principio evita que la segunda entrada
 * obligue a rehacerlo. Ver [ADR-0032](../../../../../docs/adr/0032-modos-del-asistente-y-edicion-directa.md).
 */
export const AUX_VIEWS = ['ai'] as const;

export type AuxView = (typeof AUX_VIEWS)[number];

interface ViewState {
  /** La vista lateral visible, o `null` si la barra está colapsada. */
  sideView: SideView | null;
  /** La pestaña del panel inferior visible, o `null` si el panel está cerrado. */
  panelView: PanelView | null;
  /** La vista auxiliar visible a la derecha, o `null` si la columna está colapsada. */
  auxView: AuxView | null;
  /** Muestra una vista. Si ya estaba visible, no hace nada. */
  showSide: (view: SideView) => void;
  /**
   * Muestra la vista, o colapsa la barra si esa vista ya estaba visible.
   *
   * Es lo que hace que el mismo atajo sirva para ir y para volver, que es lo
   * que la gente espera de `Ctrl+Shift+F` y de un click en el rail.
   */
  toggleSide: (view: SideView) => void;
  /** Muestra una pestaña del panel inferior, abriéndolo si estaba cerrado. */
  showPanel: (view: PanelView) => void;
  /** Muestra la pestaña, o cierra el panel si esa pestaña ya estaba visible. */
  togglePanel: (view: PanelView) => void;
  /** Cierra el panel inferior. Lo que hay adentro sigue vivo. */
  closePanel: () => void;
  /** Muestra una vista auxiliar. Si ya estaba visible, no hace nada. */
  showAux: (view: AuxView) => void;
  /** Muestra la vista auxiliar, o colapsa la columna si ya estaba visible. */
  toggleAux: (view: AuxView) => void;
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
  // El panel inferior arranca cerrado: ocupa 18rem de alto y lo que se quiere
  // ver al abrir una carpeta es el código.
  panelView: null,
  // El asistente arranca cerrado, igual que el panel inferior y por lo mismo:
  // se angosta el editor y no es lo primero que alguien quiere ver.
  auxView: null,

  showSide: (view) => {
    set({ sideView: view });
  },

  toggleSide: (view) => {
    set({ sideView: get().sideView === view ? null : view });
  },

  showPanel: (view) => {
    set({ panelView: view });
  },

  togglePanel: (view) => {
    set({ panelView: get().panelView === view ? null : view });
  },

  closePanel: () => {
    set({ panelView: null });
  },

  showAux: (view) => {
    set({ auxView: view });
  },

  toggleAux: (view) => {
    set({ auxView: get().auxView === view ? null : view });
  },
}));
