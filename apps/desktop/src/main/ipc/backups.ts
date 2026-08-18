import type { Request, Response } from '@pastecode/ipc-contract';
import {
  DiscardBackupsRequestSchema,
  PendingBackupsRequestSchema,
  WriteBackupRequestSchema,
} from '@pastecode/ipc-contract';

import { discardBackups, pendingBackups, writeBackup } from '../services/backups.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { registerHandler } from './handler.js';

/**
 * Respalda el contenido sin guardar de un archivo (RNF-08).
 *
 * La ruta pasa por `resolveInsideWorkspace` como cualquier otra que cruce el
 * IPC. No es teatro: sin eso, el nombre del respaldo lo elegiría el renderer, y
 * el contenido también.
 *
 * @param payload Request ya validado por el schema.
 * @param workspaceRoot Raíz contra la que se valida la ruta.
 * @returns Cuándo quedó guardado.
 * @example
 * await handleWriteBackup({ path: 'C:\\p\\a.ts', content: 'x' }, 'C:\\p');
 */
export async function handleWriteBackup(
  payload: Request<'backups:write'>,
  workspaceRoot: string
): Promise<Response<'backups:write'>> {
  const path = await resolveInsideWorkspace(payload.path, workspaceRoot);

  return { savedAt: await writeBackup(path, payload.content) };
}

/**
 * Los respaldos que se pueden ofrecer restaurar.
 *
 * **No exige workspace abierto**: se piden al arrancar, antes de que se sepa
 * qué carpeta se va a abrir, y el filtrado por workspace lo hace el renderer
 * cuando restaura. Los respaldos son del usuario, no de un workspace.
 *
 * @returns Los respaldos recuperables.
 * @example
 * await handlePendingBackups();
 */
export async function handlePendingBackups(): Promise<Response<'backups:pending'>> {
  return { backups: await pendingBackups() };
}

/**
 * Descarta respaldos.
 *
 * @param payload Request ya validado por el schema.
 * @returns Un objeto vacío.
 * @example
 * await handleDiscardBackups({});
 */
export async function handleDiscardBackups(
  payload: Request<'backups:discard'>
): Promise<Response<'backups:discard'>> {
  await discardBackups(payload.path);

  return {};
}

/**
 * Registra los handlers del dominio `backups`.
 *
 * @example
 * registerBackupsIpcHandlers(); // antes de app.whenReady()
 */
export function registerBackupsIpcHandlers(): void {
  registerHandler('backups:write', WriteBackupRequestSchema, (payload) =>
    handleWriteBackup(payload, requireWorkspaceRoot())
  );

  registerHandler('backups:pending', PendingBackupsRequestSchema, () => handlePendingBackups());

  registerHandler('backups:discard', DiscardBackupsRequestSchema, (payload) =>
    handleDiscardBackups(payload)
  );
}
