import { TrashFailedError } from '@pastecode/core';
import type { Request, Response } from '@pastecode/ipc-contract';
import {
  CreateEntryRequestSchema,
  DeleteEntryRequestSchema,
  IndexFilesRequestSchema,
  ReadDirectoryRequestSchema,
  ReadFileRequestSchema,
  RenameEntryRequestSchema,
  WriteFileRequestSchema,
} from '@pastecode/ipc-contract';
import { shell } from 'electron';

import { buildFileIndex, MAX_INDEXED_FILES } from '../services/file-index.js';
import {
  createDirectoryAt,
  createEmptyFile,
  readDirectoryLevel,
  readTextFile,
  renameEntry,
  writeTextFileAtomically,
} from '../services/file-system.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
import { currentSettings } from '../services/settings.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { registerHandler } from './handler.js';
import { noteOwnWrite } from './watcher.js';

/**
 * Lee un archivo del workspace.
 *
 * La raíz llega por parámetro y no se lee de un módulo global para que el test
 * pueda apuntar a un `mkdtemp` sin tocar el estado de la app. Es el mismo
 * formato que usa el ejemplo de
 * [testing.md](../../../../../docs/convenciones/testing.md#integración).
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta.
 * @returns Contenido y `mtimeMs`.
 * @example
 * await handleReadFile({ path: 'C:\\p\\a.ts' }, 'C:\\p');
 */
export async function handleReadFile(
  payload: Request<'fs:readFile'>,
  workspaceRoot: string
): Promise<Response<'fs:readFile'>> {
  return readTextFile(await resolveInsideWorkspace(payload.path, workspaceRoot));
}

/**
 * Escribe un archivo del workspace, de forma atómica.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta.
 * @returns El `mtimeMs` nuevo.
 * @example
 * await handleWriteFile({ path: 'C:\\p\\a.ts', content: 'x' }, 'C:\\p');
 */
export async function handleWriteFile(
  payload: Request<'fs:writeFile'>,
  workspaceRoot: string
): Promise<Response<'fs:writeFile'>> {
  const path = await resolveInsideWorkspace(payload.path, workspaceRoot);

  // **Antes** de escribir, no después: el watcher puede ver el archivo entre
  // el `rename` y la línea siguiente, y una marca puesta tarde no sirve de
  // nada. Sin esto, guardar dispara una recarga espuria o —si quedó una tecla
  // escrita entre medio— un diálogo de conflicto contra un cambio propio.
  noteOwnWrite(path);

  return writeTextFileAtomically(path, payload.content, payload.expectedMtimeMs);
}

/**
 * Lista un nivel de un directorio del workspace.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta y las exclusiones.
 * @returns Las entradas visibles, ya ordenadas.
 * @example
 * await handleReadDirectory({ path: 'C:\\p\\src' }, 'C:\\p');
 */
export async function handleReadDirectory(
  payload: Request<'fs:readDirectory'>,
  workspaceRoot: string,
  excludePatterns?: readonly string[]
): Promise<Response<'fs:readDirectory'>> {
  const path = await resolveInsideWorkspace(payload.path, workspaceRoot);

  return { entries: await readDirectoryLevel(path, workspaceRoot, excludePatterns) };
}

/**
 * Crea un archivo vacío dentro del workspace.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta.
 * @returns La entrada nueva.
 * @example
 * await handleCreateFile({ path: 'C:\\p\\a.ts' }, 'C:\\p');
 */
export async function handleCreateFile(
  payload: Request<'fs:createFile'>,
  workspaceRoot: string
): Promise<Response<'fs:createFile'>> {
  // Sin `noteOwnWrite`, y es a propósito: esa marca hace que el watcher se
  // trague el evento, y acá el evento es justo lo que tiene que llegar para que
  // el árbol muestre lo recién creado. La marca existe para que **guardar** no
  // dispare una recarga del editor; crear no tiene ese problema.
  const path = await resolveInsideWorkspace(payload.path, workspaceRoot);

  return { entry: await createEmptyFile(path) };
}

/**
 * Crea un directorio dentro del workspace.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta.
 * @returns La entrada nueva.
 * @example
 * await handleCreateDirectory({ path: 'C:\\p\\src' }, 'C:\\p');
 */
export async function handleCreateDirectory(
  payload: Request<'fs:createDirectory'>,
  workspaceRoot: string
): Promise<Response<'fs:createDirectory'>> {
  const path = await resolveInsideWorkspace(payload.path, workspaceRoot);

  return { entry: await createDirectoryAt(path) };
}

/**
 * Renombra o mueve una entrada del workspace.
 *
 * **Las dos rutas se validan**, no sólo el origen: si `to` no pasara por
 * `resolveInsideWorkspace`, renombrar sería la forma de sacar un archivo del
 * workspace y escribirlo en cualquier parte del disco.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se validan las dos rutas.
 * @returns La entrada con su nombre nuevo.
 * @example
 * await handleRename({ from: 'C:\\p\\a.ts', to: 'C:\\p\\b.ts' }, 'C:\\p');
 */
export async function handleRename(
  payload: Request<'fs:rename'>,
  workspaceRoot: string
): Promise<Response<'fs:rename'>> {
  const from = await resolveInsideWorkspace(payload.from, workspaceRoot);
  const to = await resolveInsideWorkspace(payload.to, workspaceRoot);

  return { entry: await renameEntry(from, to) };
}

/**
 * Manda una entrada del workspace a la papelera del sistema operativo.
 *
 * **`shell.trashItem` y no `rm`.** RF-003 pide papelera, y la diferencia
 * importa: el árbol de archivos es donde más fácil se le pega a la tecla
 * equivocada. Si la papelera falla se avisa y se corta; caer a un borrado
 * permanente sería convertir un error del sistema en pérdida de datos.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta.
 * @returns La ruta resuelta que se mandó a la papelera.
 * @throws {TrashFailedError} Si el sistema operativo no pudo moverla.
 * @example
 * await handleDelete({ path: 'C:\\p\\viejo.ts' }, 'C:\\p');
 */
export async function handleDelete(
  payload: Request<'fs:delete'>,
  workspaceRoot: string
): Promise<Response<'fs:delete'>> {
  const path = await resolveInsideWorkspace(payload.path, workspaceRoot);

  try {
    await shell.trashItem(path);
  } catch (cause) {
    throw new TrashFailedError(path, cause);
  }

  return { path };
}

/**
 * Registra los handlers del dominio `fs`.
 *
 * @example
 * registerFsIpcHandlers(); // antes de app.whenReady()
 */
export function registerFsIpcHandlers(): void {
  // Las exclusiones salen de las settings y no de la constante `DEFAULT_EXCLUDES`
  // (RF-005). Se leen en cada llamada y no al registrar: el usuario puede
  // cambiar `files.exclude` con la app abierta, y el árbol tiene que reflejarlo
  // al siguiente refresh sin reiniciar nada.
  registerHandler('fs:readDirectory', ReadDirectoryRequestSchema, (payload) =>
    handleReadDirectory(payload, requireWorkspaceRoot(), currentSettings().files.exclude)
  );

  registerHandler('fs:readFile', ReadFileRequestSchema, (payload) =>
    handleReadFile(payload, requireWorkspaceRoot())
  );

  registerHandler('fs:writeFile', WriteFileRequestSchema, (payload) =>
    handleWriteFile(payload, requireWorkspaceRoot())
  );

  // RF-003. El árbol se refresca solo con el watcher de ADR-0020, así que
  // ninguno de estos cuatro invalida nada a mano.
  registerHandler('fs:createFile', CreateEntryRequestSchema, (payload) =>
    handleCreateFile(payload, requireWorkspaceRoot())
  );

  registerHandler('fs:createDirectory', CreateEntryRequestSchema, (payload) =>
    handleCreateDirectory(payload, requireWorkspaceRoot())
  );

  registerHandler('fs:rename', RenameEntryRequestSchema, (payload) =>
    handleRename(payload, requireWorkspaceRoot())
  );

  registerHandler('fs:delete', DeleteEntryRequestSchema, (payload) =>
    handleDelete(payload, requireWorkspaceRoot())
  );

  // RF-205. El índice se construye cuando el renderer lo pide y no al abrir el
  // workspace: recorrer el árbol entero antes de pintar la primera pantalla
  // retrasaría el arranque, que es lo que mide RNF-01.
  registerHandler('files:index', IndexFilesRequestSchema, async () => {
    const files = await buildFileIndex(requireWorkspaceRoot(), currentSettings().files.exclude);

    return { files, truncated: files.length >= MAX_INDEXED_FILES };
  });
}
