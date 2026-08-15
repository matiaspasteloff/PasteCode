/** Una entrada de directorio, tal como la devuelve `fs:readDirectory`. */
export interface DirectoryEntry {
  name: string;
  /** Ruta absoluta. Es la clave de todo: expansión, pestañas, modelos. */
  path: string;
  isDirectory: boolean;
}

/** Un nodo del árbol de archivos, con sus hijos si ya se pidieron. */
export interface FileTreeNode extends DirectoryEntry {
  /**
   * Hijos ya cargados. `undefined` significa "todavía no se pidieron", que no
   * es lo mismo que `[]`, "se pidieron y la carpeta está vacía". La diferencia
   * es la que decide si al expandir hay que ir al disco o no.
   */
  children?: readonly FileTreeNode[];
}

/** Un nodo tal como lo pinta el virtualizador: en una lista plana, con su nivel. */
export interface VisibleNode {
  node: FileTreeNode;
  /** Profundidad desde la raíz, base 0. Es el sangrado. */
  depth: number;
  /** Si la carpeta está desplegada. Alimenta `aria-expanded`. */
  isExpanded: boolean;
}

/**
 * Compara respetando el orden natural: `archivo2` antes que `archivo10`.
 *
 * Se crea una sola vez porque construir un `Intl.Collator` es caro y esto
 * corre una vez por par comparado.
 *
 * Con la sensibilidad por defecto sólo devuelve 0 para cadenas equivalentes,
 * así que no hace falta desempatar: dos entradas del mismo directorio no
 * pueden llamarse igual. `README.md` y `readme.md` se ordenan de forma
 * determinista, y Node trae ICU completo en las tres plataformas.
 */
const COLLATOR = new Intl.Collator('es', { numeric: true });

/**
 * Ordena las entradas: carpetas primero, después alfabéticamente.
 *
 * Es [RF-002](../../../../docs/03-requerimientos-funcionales.md). Devuelve un
 * array nuevo en vez de ordenar el que recibe, porque el que recibe viene del
 * IPC y ordenarlo en el lugar sería mutar algo de otro.
 *
 * @param entries Entradas a ordenar.
 * @returns Un array nuevo, ordenado.
 * @example
 * sortEntries([fileB, folderZ, fileA]); // [folderZ, fileA, fileB]
 */
export function sortEntries(entries: readonly DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;

    return COLLATOR.compare(left.name, right.name);
  });
}

/**
 * Aplana el árbol a la lista de lo que se ve, respetando qué está desplegado.
 *
 * Es lo que consume el virtualizador: `@tanstack/react-virtual` necesita una
 * lista plana con un índice por fila, y un árbol no lo es. Que esta traducción
 * sea una función pura es lo que la hace testeable sin montar React.
 *
 * @param roots Nodos de primer nivel, ya ordenados.
 * @param expandedPaths Rutas absolutas de las carpetas desplegadas.
 * @returns Las filas a pintar, en orden.
 * @example
 * flattenVisibleNodes([src], new Set(['C:\\p\\src'])); // [src, src/a.ts, ...]
 */
export function flattenVisibleNodes(
  roots: readonly FileTreeNode[],
  expandedPaths: ReadonlySet<string>
): VisibleNode[] {
  const visible: VisibleNode[] = [];

  const walk = (nodes: readonly FileTreeNode[], depth: number): void => {
    for (const node of nodes) {
      const isExpanded = node.isDirectory && expandedPaths.has(node.path);
      visible.push({ node, depth, isExpanded });

      // Una carpeta desplegada cuyos hijos todavía no llegaron simplemente no
      // aporta filas. La carga la dispara la UI al expandir; acá no hay I/O.
      if (isExpanded && node.children !== undefined) walk(node.children, depth + 1);
    }
  };

  walk(roots, 0);

  return visible;
}
