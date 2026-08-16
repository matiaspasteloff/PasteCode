import type { DirectoryEntry, FileTreeNode } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/** Estado del árbol de archivos. */
interface FileTreeState {
  /** Nodos de primer nivel. Vacío mientras no haya workspace. */
  roots: readonly FileTreeNode[];
  /** Rutas absolutas de las carpetas desplegadas. */
  expandedPaths: ReadonlySet<string>;
  /** Si se está cargando el primer nivel. Las expansiones no bloquean el árbol. */
  isLoading: boolean;
  /** El último error, o `null`. Es lo que la UI muestra (RNF-25). */
  error: SerializedError | null;
  /** Carga el primer nivel de un workspace, descartando lo anterior. */
  loadRoot: (root: string) => Promise<void>;
  /** Despliega o repliega una carpeta, cargando sus hijos la primera vez. */
  toggleFolder: (path: string) => Promise<void>;
  /**
   * Vuelve a leer del disco lo que ya está a la vista, sin replegar nada.
   *
   * Existe para el watcher (RF-004). **No es `loadRoot`**: `loadRoot` descarta
   * `expandedPaths`, y usarlo acá replegaría el árbol entero cada vez que una
   * herramienta externa toca un archivo, que es exactamente el comportamiento
   * que hace que la gente apague el auto-refresh.
   */
  refresh: () => Promise<void>;
  /** Vacía el árbol. Se usa al cerrar el workspace. */
  clear: () => void;
}

/**
 * Store del árbol de archivos.
 *
 * La carga es perezosa por nivel: `loadRoot` trae la raíz y cada expansión
 * trae una sola carpeta. Es lo que hace que
 * [RF-001](../../../../../docs/03-requerimientos-funcionales.md) —árbol
 * visible en menos de 500ms con 5.000 archivos— se cumpla sin trucos.
 *
 * @example
 * const roots = useFileTreeStore((state) => state.roots);
 */
export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  roots: [],
  expandedPaths: new Set<string>(),
  isLoading: false,
  error: null,

  loadRoot: async (root) => {
    set({ isLoading: true, error: null, roots: [], expandedPaths: new Set<string>() });

    const result = await window.pastecode.invoke('fs:readDirectory', { path: root });

    if (result.ok) set({ isLoading: false, roots: result.value.entries.map(toNode) });
    else set({ isLoading: false, error: result.error });
  },

  toggleFolder: async (path) => {
    const { expandedPaths, roots } = get();

    if (expandedPaths.has(path)) {
      set({ expandedPaths: without(expandedPaths, path) });
      return;
    }

    // Se marca desplegada antes de que lleguen los hijos: la flecha responde
    // al instante y las filas aparecen cuando el disco contesta. Al revés, un
    // directorio lento se siente como un click que no hizo nada.
    set({ expandedPaths: with_(expandedPaths, path) });

    if (findNode(roots, path)?.children !== undefined) return;

    const result = await window.pastecode.invoke('fs:readDirectory', { path });

    if (!result.ok) {
      // Se repliega: dejarla abierta y vacía haría parecer que la carpeta no
      // tiene nada, cuando lo que pasó es que no se pudo leer.
      set({ expandedPaths: without(get().expandedPaths, path), error: result.error });
      return;
    }

    set({ roots: attachChildren(get().roots, path, result.value.entries.map(toNode)) });
  },

  refresh: async () => {
    const { roots, expandedPaths } = get();

    // Sin nada cargado no hay nada que refrescar: es el caso de un evento que
    // llega justo después de cerrar el workspace.
    if (roots.length === 0) return;

    const rootPath = parentOf(roots[0]?.path ?? '');
    if (rootPath === '') return;

    const reloaded = await readLevel(rootPath);
    if (reloaded === undefined) return;

    let next = reloaded;

    // Se recorren las desplegadas en orden de profundidad para que cada nivel
    // se cuelgue de una rama que ya existe en el árbol nuevo.
    for (const path of [...expandedPaths].sort((a, b) => a.length - b.length)) {
      const children = await readLevel(path);

      if (children !== undefined) next = attachChildren(next, path, children);
    }

    set({ roots: next });
  },

  clear: () => {
    set({ roots: [], expandedPaths: new Set<string>(), error: null, isLoading: false });
  },
}));

/** Lee un nivel, o `undefined` si falló. Un refresco que falla no borra nada. */
async function readLevel(path: string): Promise<readonly FileTreeNode[] | undefined> {
  const result = await window.pastecode.invoke('fs:readDirectory', { path });

  return result.ok ? result.value.entries.map(toNode) : undefined;
}

/**
 * La carpeta que contiene a una ruta.
 *
 * Se corta por el último separador y se aceptan los dos: la ruta viene del main,
 * que usa el del sistema operativo, y el renderer no tiene `node:path`.
 */
function parentOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

  return cut <= 0 ? '' : path.slice(0, cut);
}

/** Una entrada del IPC como nodo, todavía sin hijos cargados. */
function toNode(entry: DirectoryEntry): FileTreeNode {
  return { ...entry };
}

function with_(paths: ReadonlySet<string>, path: string): ReadonlySet<string> {
  return new Set([...paths, path]);
}

function without(paths: ReadonlySet<string>, path: string): ReadonlySet<string> {
  return new Set([...paths].filter((item) => item !== path));
}

/** Busca un nodo por ruta, en profundidad. */
function findNode(nodes: readonly FileTreeNode[], path: string): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;

    const found = node.children === undefined ? undefined : findNode(node.children, path);
    if (found !== undefined) return found;
  }

  return undefined;
}

/**
 * Devuelve el árbol con los hijos colgados del nodo indicado.
 *
 * Reconstruye la rama en vez de mutar el nodo porque Zustand compara por
 * identidad: mutar en el lugar deja los componentes sin re-renderizar.
 */
function attachChildren(
  nodes: readonly FileTreeNode[],
  path: string,
  children: readonly FileTreeNode[]
): readonly FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) return { ...node, children };
    if (node.children === undefined) return node;

    return { ...node, children: attachChildren(node.children, path, children) };
  });
}
