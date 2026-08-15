import { WorkspaceNotOpenError } from '@pastecode/core';

/**
 * Raíz del workspace abierto, en memoria.
 *
 * Vive en el main y no en el renderer porque es contra esto que se valida cada
 * ruta que cruza el IPC. Si la raíz la mandara el renderer en cada llamada,
 * la validación de rutas no valdría nada: el atacante elegiría la raíz.
 *
 * Todavía no se persiste. Eso es la Etapa 3 (paso 22).
 */
let currentRoot: string | undefined;

/**
 * La raíz del workspace abierto, o `undefined` si no hay ninguno.
 *
 * @example
 * if (getWorkspaceRoot() === undefined) mostrarPantallaDeBienvenida();
 */
export function getWorkspaceRoot(): string | undefined {
  return currentRoot;
}

/**
 * Cambia el workspace abierto.
 *
 * @param root Ruta absoluta de la carpeta, ya resuelta.
 * @example
 * setWorkspaceRoot('C:\\proyecto');
 */
export function setWorkspaceRoot(root: string): void {
  currentRoot = root;
}

/**
 * La raíz del workspace, o un error si no hay ninguno abierto.
 *
 * Es lo que usa todo handler de filesystem. Sin workspace no hay raíz contra
 * la cual validar, y sin eso la única respuesta correcta es negarse.
 *
 * @returns La raíz del workspace abierto.
 * @throws {WorkspaceNotOpenError} Si no hay ninguno.
 * @example
 * const safe = await resolveInsideWorkspace(payload.path, requireWorkspaceRoot());
 */
export function requireWorkspaceRoot(): string {
  if (currentRoot === undefined) throw new WorkspaceNotOpenError();

  return currentRoot;
}
