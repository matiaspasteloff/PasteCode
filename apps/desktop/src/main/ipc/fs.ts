import type { Request, Response } from '@pastecode/ipc-contract';
import { ReadFileRequestSchema, WriteFileRequestSchema } from '@pastecode/ipc-contract';

import { readTextFile, writeTextFileAtomically } from '../services/file-system.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
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
 * Registra los handlers del dominio `fs`.
 *
 * @example
 * registerFsIpcHandlers(); // antes de app.whenReady()
 */
export function registerFsIpcHandlers(): void {
  registerHandler('fs:readFile', ReadFileRequestSchema, (payload) =>
    handleReadFile(payload, requireWorkspaceRoot())
  );

  registerHandler('fs:writeFile', WriteFileRequestSchema, (payload) =>
    handleWriteFile(payload, requireWorkspaceRoot())
  );
}
