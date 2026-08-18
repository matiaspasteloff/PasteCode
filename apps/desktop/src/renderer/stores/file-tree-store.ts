import type { DirectoryEntry, FileTreeNode } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { create } from 'zustand';

/**
 * Una edición en curso en el árbol: crear algo, o renombrar lo que ya existe.
 *
 * Las tres variantes comparten forma —hay un campo de texto abierto y un
 * `Enter` que lo confirma— pero se distinguen por lo que hacen al confirmar, y
 * eso hace que `commitEdit` no necesite adivinar nada.
 */
export type TreeEdit =
  | { readonly kind: 'createFile'; readonly parentPath: string }
  | { readonly kind: 'createDirectory'; readonly parentPath: string }
  | { readonly kind: 'rename'; readonly path: string; readonly currentName: string };

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

  /** La edición abierta, o `null`. Es lo que hace que una fila sea un input. */
  edit: TreeEdit | null;
  /** La entrada que se está por eliminar, mientras el diálogo pide confirmación. */
  pendingDeletion: FileTreeNode | null;
  /** Abre un campo para crear adentro de esa carpeta. */
  startCreate: (parentPath: string, isDirectory: boolean) => void;
  /** Abre el campo de renombrar sobre una entrada existente. */
  startRename: (node: FileTreeNode) => void;
  /** Cierra la edición sin tocar el disco. */
  cancelEdit: () => void;
  /**
   * Confirma la edición abierta con el nombre escrito.
   *
   * Un nombre vacío o igual al que ya tenía **no llama al IPC**: cancela. Es lo
   * que hace que apretar `Enter` sin escribir nada no sea un error, que es lo
   * que uno espera de un campo que se abrió solo.
   */
  commitEdit: (name: string) => Promise<void>;
  /** Pide confirmación para eliminar. No toca el disco todavía. */
  requestDeletion: (node: FileTreeNode) => void;
  /** Cierra el diálogo sin eliminar. */
  cancelDeletion: () => void;
  /** Manda a la papelera lo que el diálogo estaba confirmando. */
  confirmDeletion: () => Promise<void>;
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
  ...editingSlice(set, get),

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
    set(emptyTree());
  },
}));

/** El árbol sin nada: al cerrar el workspace no queda ni edición ni error. */
function emptyTree(): Partial<FileTreeState> {
  return {
    roots: [],
    expandedPaths: new Set<string>(),
    error: null,
    isLoading: false,
    edit: null,
    pendingDeletion: null,
  };
}

/** Lo que `create` le pasa a cada porción del store. */
type Set = (partial: Partial<FileTreeState>) => void;
type Get = () => FileTreeState;

/**
 * La porción del store que maneja crear, renombrar y eliminar (RF-003).
 *
 * Está partida del resto porque son dos responsabilidades distintas —cargar y
 * navegar el árbol por un lado, modificarlo por el otro— y porque juntas pasan
 * el límite de líneas por función de RNF-20, que es el que obliga a notarlo.
 */
function editingSlice(
  set: Set,
  get: Get
): Pick<
  FileTreeState,
  | 'edit'
  | 'pendingDeletion'
  | 'startCreate'
  | 'startRename'
  | 'cancelEdit'
  | 'commitEdit'
  | 'requestDeletion'
  | 'cancelDeletion'
  | 'confirmDeletion'
> {
  return {
    edit: null,
    pendingDeletion: null,

    startCreate: (parentPath, isDirectory) => {
      set({
        edit: { kind: isDirectory ? 'createDirectory' : 'createFile', parentPath },
        error: null,
      });
    },

    startRename: (node) => {
      set({ edit: { kind: 'rename', path: node.path, currentName: node.name }, error: null });
    },

    cancelEdit: () => {
      set({ edit: null });
    },

    commitEdit: async (name) => {
      await commitOpenEdit(set, get, name);
    },

    requestDeletion: (node) => {
      set({ pendingDeletion: node, error: null });
    },

    cancelDeletion: () => {
      set({ pendingDeletion: null });
    },

    confirmDeletion: async () => {
      const { pendingDeletion } = get();
      if (pendingDeletion === null) return;

      set({ pendingDeletion: null });

      const result = await window.pastecode.invoke('fs:delete', { path: pendingDeletion.path });

      await applyResult(set, get, result);
    },
  };
}

/**
 * Confirma la edición abierta, si queda algo por hacer.
 *
 * El campo se cierra **antes** de esperar al disco: dejarlo abierto mientras la
 * operación viaja permite seguir escribiendo encima de algo ya confirmado. Si
 * la operación falla, el error se muestra igual.
 */
async function commitOpenEdit(set: Set, get: Get, name: string): Promise<void> {
  const { edit } = get();
  if (edit === null) return;

  const trimmed = name.trim();

  set({ edit: null });

  if (trimmed === '' || (edit.kind === 'rename' && trimmed === edit.currentName)) return;

  await applyResult(set, get, await runEdit(edit, trimmed));
}

/**
 * Muestra el error, o refresca el árbol.
 *
 * El watcher de ADR-0020 también va a disparar un refresco, pero llega con el
 * debounce puesto. Refrescar acá es lo que hace que el cambio se vea apenas se
 * confirma, en vez de un cuarto de segundo después.
 */
async function applyResult(
  set: Set,
  get: Get,
  result: { ok: true } | { ok: false; error: SerializedError }
): Promise<void> {
  if (!result.ok) {
    set({ error: result.error });
    return;
  }

  await get().refresh();
}

/** Manda al main la edición que se acaba de confirmar. */
async function runEdit(
  edit: TreeEdit,
  name: string
): Promise<{ ok: true } | { ok: false; error: SerializedError }> {
  if (edit.kind === 'rename') {
    return window.pastecode.invoke('fs:rename', {
      from: edit.path,
      to: joinPath(parentOf(edit.path), name),
    });
  }

  const channel = edit.kind === 'createDirectory' ? 'fs:createDirectory' : 'fs:createFile';

  return window.pastecode.invoke(channel, { path: joinPath(edit.parentPath, name) });
}

/**
 * Pega un nombre a una carpeta con el separador que ya usa esa ruta.
 *
 * El renderer no tiene `node:path` —está sandboxeado—, así que el separador se
 * deduce de la ruta que vino del main en vez de asumir uno. Asumir `/` rompería
 * en Windows, que es la plataforma primaria (RNF-26).
 */
function joinPath(parent: string, name: string): string {
  return `${parent}${parent.includes('\\') ? '\\' : '/'}${name}`;
}

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
