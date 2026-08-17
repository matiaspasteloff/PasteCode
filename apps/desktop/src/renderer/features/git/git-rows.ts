import type { GitFileStatus } from '@pastecode/core';
import type { GitRepository } from '@pastecode/ipc-contract';

/** Los dos grupos del panel: lo preparado y lo que no. */
type GitSection = 'staged' | 'changes';

/** Una fila del panel: un encabezado de grupo o un archivo. */
export type GitRow =
  | { kind: 'section'; section: GitSection; count: number }
  | {
      kind: 'file';
      section: GitSection;
      path: string;
      status: GitFileStatus;
      originalPath: string | null;
    };

/**
 * Aplana el estado del repositorio a las filas del panel.
 *
 * Un archivo puede aparecer **dos veces**: preparado y modificado otra vez es
 * exactamente lo que el código `MM` de git significa, y esconder una de las dos
 * mitades haría que preparar el archivo no cambie nada visible. Es la misma
 * decisión que toma cualquier cliente de git serio.
 *
 * Es puro para poder testear la forma de la lista sin montar nada, igual que
 * `flattenSearchRows` y `flattenProblemRows`.
 *
 * @param repository El estado que llegó del main, o `null`.
 * @returns Las filas, con el encabezado antes de cada grupo. Los grupos vacíos
 * no aparecen.
 * @example
 * flattenGitRows(repository);
 */
export function flattenGitRows(repository: GitRepository | null): GitRow[] {
  if (repository === null) return [];

  const staged = filesOf(repository, 'staged');
  const changes = filesOf(repository, 'changes');

  return [
    ...(staged.length === 0
      ? []
      : [{ kind: 'section', section: 'staged', count: staged.length } as const, ...staged]),
    ...(changes.length === 0
      ? []
      : [{ kind: 'section', section: 'changes', count: changes.length } as const, ...changes]),
  ];
}

/** Los archivos de un grupo, ordenados por ruta. */
function filesOf(repository: GitRepository, section: GitSection): GitRow[] {
  return repository.changes
    .flatMap((change): GitRow[] => {
      const status = section === 'staged' ? change.indexStatus : change.worktreeStatus;

      if (status === null) return [];

      return [
        { kind: 'file', section, path: change.path, status, originalPath: change.originalPath },
      ];
    })
    .toSorted((left, right) =>
      left.kind === 'file' && right.kind === 'file' ? left.path.localeCompare(right.path) : 0
    );
}

/**
 * El estado de cada ruta del workspace, para pintar el árbol (RF-606).
 *
 * Las claves son rutas **absolutas normalizadas con `/`**: git informa rutas
 * relativas a la raíz del repositorio y el árbol tiene absolutas del sistema
 * operativo, así que en algún lado hay que traducir. Se hace acá, una vez por
 * refresco, en vez de en cada fila del árbol.
 *
 * Las carpetas heredan `modified` si algo adentro cambió. Sin eso, un archivo
 * cambiado adentro de una carpeta colapsada es invisible, que es justo cuando
 * la marca sirve.
 *
 * @param repository El estado que llegó del main, o `null`.
 * @returns Ruta normalizada → estado.
 * @example
 * const decorations = useMemo(() => decorationsByPath(repository), [repository]);
 */
export function decorationsByPath(
  repository: GitRepository | null
): ReadonlyMap<string, GitFileStatus> {
  const decorations = new Map<string, GitFileStatus>();

  if (repository === null) return decorations;

  const root = normalizePath(repository.root);

  for (const change of repository.changes) {
    // El del árbol de trabajo gana sobre el del índice: es lo que hay en el
    // disco, que es lo que el árbol está mostrando.
    const status = change.worktreeStatus ?? change.indexStatus;

    if (status === null) continue;

    const absolute = `${root}/${change.path}`;

    decorations.set(absolute, status);

    for (const folder of ancestorsOf(absolute, root)) {
      decorations.set(folder, decorations.get(folder) ?? 'modified');
    }
  }

  return decorations;
}

/** Las carpetas entre la raíz y el archivo, sin incluir la raíz. */
function ancestorsOf(absolutePath: string, root: string): string[] {
  const ancestors: string[] = [];
  let current = absolutePath.slice(0, absolutePath.lastIndexOf('/'));

  while (current.length > root.length && current.startsWith(root)) {
    ancestors.push(current);
    current = current.slice(0, current.lastIndexOf('/'));
  }

  return ancestors;
}

/**
 * Una ruta con `/` como separador y sin barra final.
 *
 * Se normaliza a mano y no con `node:path` porque el renderer no tiene acceso
 * a Node: es la misma razón por la que `splitDisplayPath` tampoco lo usa.
 *
 * @param path Ruta con cualquiera de los dos separadores.
 * @returns La ruta normalizada.
 * @example
 * normalizePath('C:\\p\\src\\'); // 'C:/p/src'
 */
export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '');
}
