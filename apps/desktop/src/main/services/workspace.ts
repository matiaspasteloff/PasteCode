import { realpath as realpathWithCallback } from 'node:fs';
import { promisify } from 'node:util';

import { FileAccessError, workspaceDisplayName, WorkspaceNotOpenError } from '@pastecode/core';
import type { WorkspaceInfo } from '@pastecode/ipc-contract';

/**
 * `realpath` que además expande los nombres 8.3 de Windows.
 *
 * La implementación en JS de `node:fs/promises` resuelve symlinks pero deja
 * `C:\PROGRA~1` tal cual, y esa mitad no es opcional: la raíz que se guarda acá
 * termina en `startFileWatcher` y `startGitWatcher`, y un watcher de libuv sobre
 * una ruta corta **aborta el proceso** —`Assertion failed: !_wcsnicmp(filename,
 * dir, dirlen)`, `src\win\fs-event.c`—. Un abort en el main no es un error que
 * se pueda reportar: se lleva la ventana, la sesión y las pestañas sin guardar.
 *
 * `node:fs/promises` no expone la variante nativa, así que se promisifica la de
 * `node:fs`.
 */
const realpath = promisify(realpathWithCallback.native);

/**
 * Workspace abierto, en memoria.
 *
 * Vive en el main y no en el renderer porque es contra esto que se valida cada
 * ruta que cruza el IPC. Si la raíz la mandara el renderer en cada llamada, la
 * validación de rutas no valdría nada: el atacante elegiría la raíz.
 *
 * Todavía no se persiste entre sesiones. Eso es la Etapa 3 (paso 22).
 */
let current: WorkspaceInfo | undefined;

/**
 * El workspace abierto, o `null` si no hay ninguno.
 *
 * Devuelve `null` y no `undefined` porque es lo que cruza el IPC, y
 * `undefined` no sobrevive a la serialización: una propiedad con `undefined`
 * desaparece del objeto en vez de llegar como tal.
 *
 * @example
 * if (getWorkspace() === null) mostrarPantallaDeBienvenida();
 */
export function getWorkspace(): WorkspaceInfo | null {
  return current ?? null;
}

/**
 * Abre una carpeta como workspace, reemplazando al anterior si había uno.
 *
 * Resuelve la raíz con `realpath` antes de guardarla. No es un detalle: todo
 * `isInsideRoot` posterior compara contra este valor, y si la raíz quedara sin
 * resolver mientras las rutas candidatas sí se resuelven, un workspace abierto
 * a través de un symlink rechazaría todos sus propios archivos. Y en Windows
 * hace además que la raíz nunca llegue a un watcher en formato 8.3, que es lo
 * que evita un abort del main.
 *
 * @param root Ruta absoluta de la carpeta elegida.
 * @returns El workspace abierto, con su nombre para mostrar.
 * @throws {FileAccessError} Si la carpeta no existe o no se puede resolver.
 * @example
 * const workspace = await openWorkspaceAt('C:\\proyectos\\PasteCode');
 */
export async function openWorkspaceAt(root: string): Promise<WorkspaceInfo> {
  const resolved = await realpath(root).catch((cause: unknown) => {
    throw new FileAccessError(root, cause);
  });

  current = { root: resolved, name: workspaceDisplayName(resolved) };

  return current;
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
  if (current === undefined) throw new WorkspaceNotOpenError();

  return current.root;
}
