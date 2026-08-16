import type { SearchMatch } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Un archivo con sus matches, que es como RF-202 pide mostrarlos. */
export interface SearchGroup {
  path: string;
  matches: SearchMatch[];
}

interface SearchState {
  query: string;
  includeGlobs: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  matchWholeWord: boolean;
  /** Resultados agrupados por archivo, en el orden en que llegaron. */
  groups: SearchGroup[];
  matchCount: number;
  /** Si hay una búsqueda corriendo. Es el feedback de progreso de RNF-24. */
  isSearching: boolean;
  /** Si se cortó por el tope. Distinto de "no había más". */
  isTruncated: boolean;
  error: SerializedError | null;

  setQuery: (query: string) => void;
  setIncludeGlobs: (globs: string) => void;
  toggleOption: (option: 'isRegex' | 'isCaseSensitive' | 'matchWholeWord') => void;
  /** Lanza la búsqueda con lo que haya en el formulario. */
  run: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Agrega un lote que llegó por `search:result`. */
  addMatches: (searchId: string, matches: readonly SearchMatch[]) => void;
  /** Cierra la búsqueda que avisó `search:done`. */
  finish: (searchId: string, truncated: boolean, error: SerializedError | null) => void;
}

/** Id de la búsqueda en curso. Fuera del store: no se pinta. */
let currentSearchId = '';

/** El estado de resultados, en limpio. Se reusa al arrancar y al vaciar. */
const EMPTY_RESULTS = {
  groups: [],
  matchCount: 0,
  isTruncated: false,
  error: null,
} satisfies Partial<SearchState>;

/**
 * Un id nuevo para cada búsqueda.
 *
 * Lleva un componente aleatorio además del reloj porque dos búsquedas
 * disparadas en el mismo milisegundo —tipear rápido con el debounce corto—
 * compartirían id, y entonces los resultados de la primera pasarían el filtro
 * de la segunda.
 */
function nextSearchId(): string {
  return `search-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
}

/**
 * Store de la búsqueda en workspace.
 *
 * Los resultados se acumulan a medida que llegan y no al final: es lo que hace
 * alcanzable el presupuesto de [RF-201](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace).
 *
 * Todo evento trae el `searchId` y **se descarta el que no coincide**. Entre
 * que se cancela una búsqueda y que ripgrep muere pasan milisegundos en los
 * que sigue escribiendo, y sin este filtro esos resultados se pintan sobre los
 * de la consulta siguiente.
 *
 * @example
 * const groups = useSearchStore((state) => state.groups);
 */
export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  includeGlobs: '',
  isRegex: false,
  isCaseSensitive: false,
  matchWholeWord: false,
  groups: [],
  matchCount: 0,
  isSearching: false,
  isTruncated: false,
  error: null,

  setQuery: (query) => {
    set({ query });
  },

  setIncludeGlobs: (includeGlobs) => {
    set({ includeGlobs });
  },

  toggleOption: (option) => {
    set({ [option]: !get()[option] });
  },

  run: () => startSearch(get(), set),

  cancel: async () => {
    currentSearchId = '';
    set({ isSearching: false });

    await window.pastecode.invoke('search:cancel', {});
  },

  addMatches: (searchId, matches) => {
    if (searchId !== currentSearchId) return;

    set((state) => ({
      groups: groupInto(state.groups, matches),
      matchCount: state.matchCount + matches.length,
    }));
  },

  finish: (searchId, truncated, error) => {
    if (searchId !== currentSearchId) return;

    set({ isSearching: false, isTruncated: truncated, error });
  },
}));

/**
 * Lanza la búsqueda con lo que hay en el formulario.
 *
 * Está afuera de la fábrica del store sólo para que la fábrica quepa de un
 * vistazo; no tiene otra vida propia.
 */
async function startSearch(
  state: SearchState,
  set: (partial: Partial<SearchState>) => void
): Promise<void> {
  if (state.query === '') {
    // Vaciar el campo no es una búsqueda sin resultados: es no estar buscando.
    // El id se limpia para que lo que llegue de la anterior no se pinte.
    currentSearchId = '';
    set({ ...EMPTY_RESULTS, isSearching: false });
    return;
  }

  currentSearchId = nextSearchId();
  set({ ...EMPTY_RESULTS, isSearching: true });

  const result = await window.pastecode.invoke('search:start', {
    searchId: currentSearchId,
    query: state.query,
    isRegex: state.isRegex,
    isCaseSensitive: state.isCaseSensitive,
    matchWholeWord: state.matchWholeWord,
    includeGlobs: splitGlobs(state.includeGlobs),
  });

  if (!result.ok) set({ isSearching: false, error: result.error });
}

/**
 * Separa los globs escritos en el campo de inclusión.
 *
 * Se acepta coma y espacio porque las dos convenciones existen y equivocarse
 * no debería costar una búsqueda vacía sin explicación.
 */
function splitGlobs(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((glob) => glob.trim())
    .filter((glob) => glob !== '');
}

/**
 * Agrega los matches al grupo de su archivo, creándolo si es el primero.
 *
 * Se reconstruyen los grupos tocados en vez de mutarlos porque Zustand compara
 * por identidad: mutar en el lugar deja la lista sin repintar.
 */
function groupInto(
  groups: readonly SearchGroup[],
  matches: readonly SearchMatch[]
): SearchGroup[] {
  const byPath = new Map(groups.map((group) => [group.path, group]));

  for (const match of matches) {
    const existing = byPath.get(match.path);

    byPath.set(
      match.path,
      existing === undefined
        ? { path: match.path, matches: [match] }
        : { path: existing.path, matches: [...existing.matches, match] }
    );
  }

  return [...byPath.values()];
}
