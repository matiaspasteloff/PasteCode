import type { Request, Response } from '@pastecode/ipc-contract';
import {
  IndexFilesRequestSchema,
  ReadDirectoryRequestSchema,
  ReadFileRequestSchema,
  WriteFileRequestSchema,
} from '@pastecode/ipc-contract';

import { buildFileIndex, MAX_INDEXED_FILES } from '../services/file-index.js';
import {
  readDirectoryLevel,
  readTextFile,
  writeTextFileAtomically,
} from '../services/file-system.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
import { currentSettings } from '../services/settings.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { registerHandler } from './handler.js';

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

  // RF-205. El índice se construye cuando el renderer lo pide y no al abrir el
  // workspace: recorrer el árbol entero antes de pintar la primera pantalla
  // retrasaría el arranque, que es lo que mide RNF-01.
  registerHandler('files:index', IndexFilesRequestSchema, async () => {
    const files = await buildFileIndex(requireWorkspaceRoot(), currentSettings().files.exclude);

    return { files, truncated: files.length >= MAX_INDEXED_FILES };
  });
}
