/**
 * Qué le pasó a un archivo, según git.
 *
 * Es una unión de literales y no los códigos `XY` crudos de git porque la UI
 * pinta cinco colores y no veinte combinaciones: `--porcelain=v2` distingue
 * copiado de renombrado y cambio de tipo de modificación, y ninguna de esas
 * distinciones cambia lo que se dibuja.
 */
export type GitFileStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflict';

/** Un archivo con cambios, con sus dos estados. */
export interface GitFileChange {
  /** Ruta **relativa a la raíz del repositorio**, siempre con `/`. */
  readonly path: string;
  /** Qué hay en el índice, o `null` si no hay nada preparado. */
  readonly indexStatus: GitFileStatus | null;
  /** Qué hay en el árbol de trabajo, o `null` si está limpio. */
  readonly worktreeStatus: GitFileStatus | null;
  /** De dónde venía, si es un renombrado. */
  readonly originalPath: string | null;
}

/** En qué rama está el repositorio y cuánto se desvió de su upstream. */
export interface GitBranchInfo {
  /** El nombre corto, o `null` si el HEAD está suelto. */
  readonly name: string | null;
  readonly upstream: string | null;
  /** Commits propios que el upstream no tiene. */
  readonly ahead: number;
  /** Commits del upstream que no están acá. */
  readonly behind: number;
}

/** El estado completo de un repositorio. */
export interface GitStatus {
  readonly branch: GitBranchInfo;
  readonly changes: readonly GitFileChange[];
}

/** Lo que devuelve un repositorio recién detectado y sin nada raro. */
export const EMPTY_GIT_STATUS: GitStatus = {
  branch: { name: null, upstream: null, ahead: 0, behind: 0 },
  changes: [],
};
