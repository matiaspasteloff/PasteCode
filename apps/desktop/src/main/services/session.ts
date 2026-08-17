import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { RestorablePlan, WorkspaceState } from '@pastecode/core';
import { fromFileUri, planRestore, WorkspaceStateSchema } from '@pastecode/core';

import { writeTextFileAtomically } from './file-system.js';

/**
 * Cuánto se espera antes de escribir la sesión.
 *
 * Son los 2 segundos que fija el
 * [modelo de datos](../../../../../docs/05-modelo-de-datos.md#estado-del-workspace).
 * Sin el debounce, mover el cursor escribiría un archivo por pulsación.
 */
const SAVE_DEBOUNCE_MS = 2000;

/**
 * Lo que el renderer reporta: todo menos la marca de tiempo, que la pone quien
 * escribe.
 *
 * Es un tipo propio y no un `Omit<WorkspaceState, 'lastSavedAt'>` porque
 * `WorkspaceState` es un objeto laxo —tiene índice de claves desconocidas, a
 * propósito, para no rechazar un archivo escrito por una versión más nueva— y
 * `Omit` sobre un índice se queda sólo con el índice.
 */
export interface SessionSnapshot {
  rootPath: string;
  openTabs: WorkspaceState['openTabs'];
  activeTabIndex: number;
  expandedFolders: string[];
  /** Los grupos, si el renderer los reportó. Ver ADR-0023. */
  groups?: WorkspaceState['groups'] | undefined;
  layout?: WorkspaceState['layout'] | undefined;
  activeGroupId?: string | undefined;
}

/** Dónde viven los archivos de sesión. */
let directory = join(homedir(), '.pastecode', 'workspaces');
let pending: NodeJS.Timeout | undefined;

/**
 * El archivo de sesión de un workspace.
 *
 * El nombre es el SHA-256 de la raíz y no la ruta escapada por dos razones:
 * una ruta larga de Windows más el directorio de sesiones se pasa del límite
 * de 260 caracteres, y una ruta contiene el nombre de usuario y la estructura
 * de carpetas de alguien, que no hace falta desparramar en nombres de archivo.
 *
 * @param rootPath Raíz del workspace.
 * @returns Ruta absoluta del archivo.
 * @example
 * sessionFileFor('C:\\proyecto'); // '~/.pastecode/workspaces/9f86d0...json'
 */
export function sessionFileFor(rootPath: string): string {
  const digest = createHash('sha256').update(rootPath).digest('hex');

  return join(directory, `${digest}.json`);
}

/**
 * Cambia el directorio de sesiones. Sólo lo usan los tests.
 *
 * @param path Directorio donde guardar los archivos.
 * @example
 * useSessionDirectory(await mkdtemp(...));
 */
export function useSessionDirectory(path: string): void {
  directory = path;
}

/**
 * Lee la sesión guardada de un workspace.
 *
 * Un archivo que no existe, que no parsea o que no cumple el schema devuelve
 * `null`, sin distinguir entre los casos: no hay ninguna acción distinta que
 * tomar, y molestar a alguien con "tu archivo de sesión está corrupto" cuando
 * lo único que se pierde es qué pestañas tenía abiertas sería ruido.
 *
 * @param rootPath Raíz del workspace.
 * @returns La sesión, o `null`.
 * @example
 * const state = await loadSession('C:\\proyecto');
 */
export async function loadSession(rootPath: string): Promise<WorkspaceState | null> {
  try {
    const raw = await readFile(sessionFileFor(rootPath), 'utf8');

    return WorkspaceStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Guarda la sesión, con debounce.
 *
 * @param state Lo que el renderer sabe: pestañas, activa y carpetas abiertas.
 * @example
 * scheduleSessionSave({ rootPath, openTabs, activeTabIndex, expandedFolders });
 */
export function scheduleSessionSave(state: SessionSnapshot): void {
  if (pending !== undefined) clearTimeout(pending);

  pending = setTimeout(() => {
    pending = undefined;

    void writeSession(state);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Escribe la sesión ahora, sin esperar el debounce.
 *
 * La llama el cierre de la app: si sólo existiera la versión con debounce, lo
 * último que hizo alguien antes de cerrar —abrir una pestaña, moverse— se
 * perdería siempre, que es justo lo que RF-707 promete que no pasa.
 *
 * @param state Lo mismo que `scheduleSessionSave`.
 * @example
 * await flushSessionSave(state);
 */
export async function flushSessionSave(state: SessionSnapshot): Promise<void> {
  if (pending !== undefined) clearTimeout(pending);
  pending = undefined;

  await writeSession(state);
}

/** Cancela un guardado pendiente. La llaman los tests y el cierre. */
export function disposeSession(): void {
  if (pending !== undefined) clearTimeout(pending);
  pending = undefined;
}

/**
 * Arma el plan de restauración, resolviendo qué archivos siguen existiendo.
 *
 * El predicado de existencia se resuelve acá y no en `packages/core` porque
 * toca el disco. El descarte en sí es puro y vive en core, testeado.
 *
 * @param state La sesión leída.
 * @returns El plan, ya sin los archivos que desaparecieron.
 * @example
 * const plan = await planSessionRestore(state);
 */
export async function planSessionRestore(state: WorkspaceState): Promise<RestorablePlan> {
  const existing = new Set<string>();

  const everyTab = [
    ...state.openTabs,
    ...(state.groups ?? []).flatMap((group) => group.openTabs),
  ];

  await Promise.all(
    everyTab.map(async (tab) => {
      const path = fromFileUri(tab.uri);
      if (path === undefined) return;

      await access(path).then(
        () => existing.add(path),
        () => undefined
      );
    })
  );

  return planRestore(state, (path) => existing.has(path));
}

/** Escribe el archivo, de forma atómica. */
async function writeSession(state: SessionSnapshot): Promise<void> {
  const complete: WorkspaceState = { ...state, lastSavedAt: Date.now() };

  await mkdir(directory, { recursive: true });
  // RNF-07 vale también acá: no es código, pero es trabajo de alguien.
  await writeTextFileAtomically(
    sessionFileFor(state.rootPath),
    `${JSON.stringify(complete, null, 2)}\n`
  );
}
