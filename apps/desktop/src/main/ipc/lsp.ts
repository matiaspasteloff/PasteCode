import { pathToFileURL } from 'node:url';

import type { DocumentDiagnostics } from '@pastecode/core';
import { toLspRange } from '@pastecode/core';
import type { LspServerStatus, Request, Response } from '@pastecode/ipc-contract';
import {
  ChangeDocumentRequestSchema,
  CloseDocumentRequestSchema,
  CompletionRequestSchema,
  DefinitionRequestSchema,
  HoverRequestSchema,
  LspStatusRequestSchema,
  OpenDocumentRequestSchema,
  ResolveCompletionRequestSchema,
} from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import {
  clientForLanguage,
  clientForPath,
  configureLspRegistry,
  lspStatuses,
  openDocuments,
  stopLspServers,
} from '../lsp/registry.js';
import {
  requestCompletion,
  requestDefinition,
  requestHover,
  resolveCompletion,
} from '../lsp/requests.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
import { registerDisposer } from '../services/shutdown.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * Registra los handlers del dominio `lsp`.
 *
 * @example
 * registerLspIpcHandlers(); // antes de app.whenReady()
 */
export function registerLspIpcHandlers(): void {
  configureLspRegistry({
    onDiagnostics: broadcastDiagnostics,
    onStatus: broadcastStatus,
  });

  // Sin esto, cerrar la app deja vivos al servidor de lenguaje **y al
  // `tsserver` que él lanzó**, que es el caso que `requestGracefulExit` existe
  // para cubrir: matar al padre con una señal no limpia al hijo.
  registerDisposer('lsp', (graceMs) => stopLspServers(graceMs));

  registerHandler('lsp:openDocument', OpenDocumentRequestSchema, handleOpenDocument);
  registerHandler('lsp:changeDocument', ChangeDocumentRequestSchema, handleChangeDocument);
  registerHandler('lsp:closeDocument', CloseDocumentRequestSchema, handleCloseDocument);
  registerHandler('lsp:status', LspStatusRequestSchema, () => ({ servers: lspStatuses() }));

  // Los tres proveedores. No cancelan a mano: el single-flight por
  // `(serverId, método)` del cliente hace que pedir otro completado cancele el
  // anterior con `$/cancelRequest`, y el evento que cancela una request es
  // siempre la siguiente.
  registerHandler('lsp:completion', CompletionRequestSchema, async (payload) =>
    requestCompletion(
      await insideWorkspace(payload.path),
      payload.position,
      payload.triggerCharacter
    )
  );

  registerHandler('lsp:resolveCompletion', ResolveCompletionRequestSchema, (payload) =>
    resolveCompletion(payload.serverId, payload.id)
  );

  registerHandler('lsp:hover', HoverRequestSchema, async (payload) =>
    requestHover(await insideWorkspace(payload.path), payload.position)
  );

  registerHandler('lsp:definition', DefinitionRequestSchema, async (payload) =>
    requestDefinition(await insideWorkspace(payload.path), payload.position)
  );
}

/** Resuelve la ruta contra el workspace abierto. RNF-11, sin excepciones. */
function insideWorkspace(path: string): Promise<string> {
  return resolveInsideWorkspace(path, requireWorkspaceRoot());
}

/**
 * Abre un documento en el servidor de su lenguaje, arrancándolo si hace falta.
 *
 * Es el único punto donde un servidor se lanza: **perezoso**, en el primer
 * archivo de su lenguaje. Ver el porqué en `registry.clientForLanguage`.
 */
async function handleOpenDocument(
  payload: Request<'lsp:openDocument'>
): Promise<Response<'lsp:openDocument'>> {
  const path = await resolveInsideWorkspace(payload.path, requireWorkspaceRoot());
  const client = clientForLanguage(payload.languageId);

  if (client === null) return { serverId: null };

  openDocuments().open({
    path,
    serverId: client.serverId,
    languageId: payload.languageId,
    version: payload.version,
  });

  client.notify('textDocument/didOpen', {
    textDocument: {
      uri: pathToFileURL(path).toString(),
      languageId: payload.languageId,
      version: payload.version,
      text: payload.text,
    },
  });

  return { serverId: client.serverId };
}

/**
 * Aplica un lote de cambios incrementales.
 *
 * La guarda de versión vive en el registro y **descarta en silencio** lo que no
 * avanza: una descarga vieja que llega después de un close/reopen no es un
 * error del renderer, es la carrera normal entre un debounce y una pestaña que
 * se cierra. Aplicarla sí sería un error, y de los que no se notan hasta que
 * todos los rangos del servidor están corridos.
 */
async function handleChangeDocument(
  payload: Request<'lsp:changeDocument'>
): Promise<Response<'lsp:changeDocument'>> {
  const path = await resolveInsideWorkspace(payload.path, requireWorkspaceRoot());

  if (!openDocuments().accept(path, payload.version)) return {};

  clientForPath(path)?.notify('textDocument/didChange', {
    textDocument: { uri: pathToFileURL(path).toString(), version: payload.version },
    contentChanges: payload.changes.map((change) => ({
      range: toLspRange(change.range),
      text: change.text,
    })),
  });

  return {};
}

/** Cierra el documento. Sin esto el servidor sigue analizando lo que nadie mira. */
async function handleCloseDocument(
  payload: Request<'lsp:closeDocument'>
): Promise<Response<'lsp:closeDocument'>> {
  const path = await resolveInsideWorkspace(payload.path, requireWorkspaceRoot());
  const closed = openDocuments().close(path);

  if (closed === undefined) return {};

  clientForPath(path)?.notify('textDocument/didClose', {
    textDocument: { uri: pathToFileURL(path).toString() },
  });

  return {};
}

/** Manda un lote de diagnósticos a todas las ventanas. */
function broadcastDiagnostics(serverId: string, documents: DocumentDiagnostics[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'lsp:diagnostics', { serverId, documents });
  }
}

/** Ídem para un cambio de estado de un servidor. */
function broadcastStatus(server: LspServerStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'lsp:serverChanged', { server });
  }
}
