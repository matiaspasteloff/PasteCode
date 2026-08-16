import type { TabState, WorkspaceState } from './schema.js';

/** El prefijo de un URI de archivo. Es el único esquema que se persiste. */
const FILE_SCHEME = 'file:///';

/**
 * Traduce una ruta absoluta al URI que se guarda en el archivo de sesión.
 *
 * Se escribe a mano y no con `pathToFileURL` de `node:url` por la regla de
 * dependencias: `packages/core` tiene que correr en un test sin nada de Node.
 * Es también lo que hace que una ruta de Windows produzca el mismo URI en el
 * runner de Linux del CI.
 *
 * @param path Ruta absoluta.
 * @returns El URI, con barras normales y las barras invertidas traducidas.
 * @example
 * toFileUri('C:\\proyecto\\a.ts'); // 'file:///C:/proyecto/a.ts'
 */
export function toFileUri(path: string): string {
  const normalized = path.replaceAll('\\', '/');

  return `${FILE_SCHEME}${normalized.startsWith('/') ? normalized.slice(1) : normalized}`;
}

/**
 * La ruta absoluta de un URI de archivo.
 *
 * @param uri URI a traducir.
 * @returns La ruta, o `undefined` si el URI no es de un archivo.
 * @example
 * fromFileUri('file:///C:/proyecto/a.ts'); // 'C:/proyecto/a.ts'
 * fromFileUri('http://example.com');       // undefined
 */
export function fromFileUri(uri: string): string | undefined {
  if (!uri.startsWith(FILE_SCHEME)) return undefined;

  const rest = uri.slice(FILE_SCHEME.length);

  // Una ruta POSIX pierde su barra inicial al escribirse; una de Windows
  // arranca con la letra de unidad y no la necesita.
  return /^[a-zA-Z]:/.test(rest) ? rest : `/${rest}`;
}

/** Una sesión ya filtrada, lista para aplicar. */
export interface RestorablePlan {
  /** Sólo las pestañas cuyo archivo sigue existiendo, en orden. */
  openTabs: readonly TabState[];
  /** Índice de la activa **dentro de `openTabs`**. `-1` si no quedó ninguna. */
  activeTabIndex: number;
  expandedFolders: readonly string[];
}

/**
 * Arma el plan de restauración, descartando lo que ya no se puede abrir.
 *
 * **Los archivos que ya no existen se descartan en silencio.** Es lo que pide
 * RF-707 y es lo correcto: entre la sesión anterior y ésta pasó un `git
 * checkout`, y avisar de cinco archivos borrados cada vez que se cambia de
 * rama sería un diálogo que todo el mundo aprende a cerrar sin leer.
 *
 * Que el descarte sea puro y esté acá —y no adentro del store del renderer— es
 * lo que lo hace testeable sin montar nada.
 *
 * @param state La sesión leída del disco.
 * @param exists Predicado sobre rutas absolutas. Lo resuelve el main.
 * @returns El plan, con los índices ya recalculados.
 * @example
 * planRestore(state, (path) => existingPaths.has(path));
 */
export function planRestore(
  state: WorkspaceState,
  exists: (path: string) => boolean
): RestorablePlan {
  const previousActive = state.openTabs[state.activeTabIndex];
  const openTabs = state.openTabs.filter((tab) => {
    const path = fromFileUri(tab.uri);

    return path !== undefined && exists(path);
  });

  // El índice se recalcula por identidad y no se conserva: si se descartó una
  // pestaña anterior a la activa, el número viejo apunta a otra cosa.
  const activeTabIndex = previousActive === undefined ? -1 : openTabs.indexOf(previousActive);

  return {
    openTabs,
    // Si la que estaba activa desapareció, queda la primera que sobrevivió.
    activeTabIndex: activeTabIndex === -1 && openTabs.length > 0 ? 0 : activeTabIndex,
    expandedFolders: state.expandedFolders,
  };
}
