import type { Diagnostic, DocumentDiagnostics } from '@pastecode/core';
import { create } from 'zustand';

/** Lo que se sabe de los problemas de un archivo. */
export interface FileProblems {
  readonly diagnostics: readonly Diagnostic[];
  /** Si el servidor mandó más de los que entran en `lsp.maxDiagnosticsPerFile`. */
  readonly truncated: boolean;
}

interface ProblemsState {
  /**
   * Los problemas por ruta.
   *
   * Los archivos **sin diagnósticos no están en el mapa**: una publicación
   * vacía es cómo el protocolo dice "esto ya está arreglado", así que la
   * entrada se borra en vez de quedar como un archivo con cero problemas que
   * la lista tendría que filtrar en cada render.
   */
  byPath: ReadonlyMap<string, FileProblems>;
  /** Aplica un lote de `lsp:diagnostics`. Reemplaza por archivo, no acumula. */
  apply: (documents: readonly DocumentDiagnostics[]) => void;
  /** Vacía todo. Se llama al cambiar de workspace. */
  clear: () => void;
}

/**
 * Los diagnósticos de todo el workspace ([RF-403](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Es un store aparte del editor por lo mismo que `editor-status-store`: los
 * diagnósticos llegan en lotes mientras alguien escribe, y si vivieran en
 * `editor-store` cada lote repintaría las pestañas y el árbol.
 *
 * **Los conteos no están acá.** Se derivan en un `useMemo` de quien los
 * muestra, que es lo que pide la regla 5 de
 * [codigo.md](../../../../../docs/convenciones/codigo.md#reglas-de-react-renderer):
 * guardarlos sería estado derivado, con su forma clásica de desincronizarse.
 *
 * @example
 * const byPath = useProblemsStore((state) => state.byPath);
 */
export const useProblemsStore = create<ProblemsState>((set, get) => ({
  byPath: new Map(),

  apply: (documents) => {
    // Se reconstruye el mapa en vez de mutarlo porque Zustand compara por
    // identidad: mutar en el lugar deja la lista sin repintar.
    const next = new Map(get().byPath);

    for (const document of documents) {
      if (document.diagnostics.length === 0) {
        next.delete(document.path);
        continue;
      }

      next.set(document.path, {
        diagnostics: document.diagnostics,
        truncated: document.truncated,
      });
    }

    set({ byPath: next });
  },

  clear: () => {
    set({ byPath: new Map() });
  },
}));

/** Cuántos problemas hay de cada severidad que la barra de estado muestra. */
export interface ProblemCounts {
  readonly errors: number;
  readonly warnings: number;
}

/**
 * Cuenta errores y advertencias de todo el workspace.
 *
 * Es una función pura sobre el mapa para que quien la use la envuelva en un
 * `useMemo` con `byPath` como dependencia: así recorrer los archivos cuesta una
 * vez por lote de diagnósticos y no una vez por render.
 *
 * @param byPath El mapa del store.
 * @returns Los dos conteos.
 * @example
 * const counts = useMemo(() => countProblems(byPath), [byPath]);
 */
export function countProblems(byPath: ReadonlyMap<string, FileProblems>): ProblemCounts {
  let errors = 0;
  let warnings = 0;

  for (const file of byPath.values()) {
    for (const diagnostic of file.diagnostics) {
      if (diagnostic.severity === 'error') errors += 1;
      else if (diagnostic.severity === 'warning') warnings += 1;
    }
  }

  return { errors, warnings };
}
