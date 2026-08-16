import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { DocumentDiagnostics, LanguageServerDefinition } from '@pastecode/core';
import { languageServerFor, languageServerForPath } from '@pastecode/core';
import type { LspServerStatus } from '@pastecode/ipc-contract';
import { app } from 'electron';

import { currentSettings } from '../services/settings.js';
import { getWorkspace } from '../services/workspace.js';

import type { LanguageClient } from './client.js';
import { createLanguageClient } from './client.js';
import type { DiagnosticsBatcher } from './diagnostics.js';
import { createDiagnosticsBatcher, toDocumentDiagnostics } from './diagnostics.js';
import type { DocumentRegistry } from './documents.js';
import { createDocumentRegistry } from './documents.js';
import { resolveInitializationOptions, resolveServerLaunch } from './resolve-server-path.js';

/** A quién le avisa el registro cuando algo pasa. */
export interface LspRegistryCallbacks {
  readonly onDiagnostics: (serverId: string, documents: DocumentDiagnostics[]) => void;
  readonly onStatus: (status: LspServerStatus) => void;
}

/** Los clientes vivos, por `serverId`. */
const clients = new Map<string, LanguageClient>();

/**
 * Los servidores que no arrancaron, con su motivo.
 *
 * Se recuerdan para no volver a intentarlo con cada archivo que se abra: si
 * falta `typescript` en el workspace, va a seguir faltando, y reintentarlo por
 * archivo son N procesos que mueren y N mensajes iguales.
 */
const failures = new Map<string, LspServerStatus>();

/** Los documentos abiertos, compartidos por todos los servidores. */
const documents: DocumentRegistry = createDocumentRegistry();

let callbacks: LspRegistryCallbacks | null = null;
let batcher: DiagnosticsBatcher | null = null;

/**
 * Conecta el registro con quien empuja los eventos al renderer.
 *
 * Es el mismo reparto que `services/search.ts` y `ipc/search.ts`: el servicio
 * no sabe que existe `BrowserWindow`, y por eso se puede testear sin Electron.
 *
 * @param next Adónde van los diagnósticos y los cambios de estado.
 * @example
 * configureLspRegistry({ onDiagnostics, onStatus });
 */
export function configureLspRegistry(next: LspRegistryCallbacks): void {
  callbacks = next;
  batcher?.dispose();
  batcher = createDiagnosticsBatcher((serverId, batch) => {
    next.onDiagnostics(serverId, batch);
  });
}

/** El registro de documentos abiertos. */
export function openDocuments(): DocumentRegistry {
  return documents;
}

/**
 * El cliente que atiende un `languageId`, arrancándolo si hace falta.
 *
 * **Los servidores son perezosos**: ninguno se lanza al arrancar la app, sino
 * en el primer `lsp:openDocument` de su lenguaje. Levantar `tsserver` en el
 * boot son 150-300MB y varios segundos contra el presupuesto de 1,5s de
 * RNF-01, para alguien que a lo mejor abrió una carpeta de markdown.
 *
 * @param languageId El id que reporta el modelo de Monaco.
 * @returns El cliente, o `null` si el lenguaje no tiene servidor, el LSP está
 * apagado, no hay workspace o el servidor ya falló antes.
 * @example
 * clientForLanguage('typescript')?.notify('textDocument/didOpen', params);
 */
export function clientForLanguage(languageId: string): LanguageClient | null {
  const definition = languageServerFor(languageId);

  return definition === undefined ? null : clientFor(definition);
}

/**
 * El cliente que atiende un archivo, por su extensión.
 *
 * @param path Ruta absoluta del archivo.
 * @returns El cliente ya vivo, o `null`. **No arranca ninguno**: quien llega
 * por acá es una request sobre un documento que ya tuvo que abrirse.
 * @example
 * clientForPath('C:\\p\\a.ts');
 */
export function clientForPath(path: string): LanguageClient | null {
  const definition = languageServerForPath(path);

  if (definition === undefined) return null;

  return clients.get(definition.serverId) ?? null;
}

/** El estado de todos los servidores conocidos: los vivos y los que fallaron. */
export function lspStatuses(): LspServerStatus[] {
  return [...[...clients.values()].map((client) => client.status()), ...failures.values()];
}

/**
 * Apaga todos los servidores y olvida los documentos.
 *
 * Se llama al cerrar la app y al cambiar de workspace: un servidor de lenguaje
 * está atado a una raíz, y hacerle preguntas sobre otra da respuestas de la
 * carpeta anterior.
 *
 * @param graceMs La ventana de gracia compartida de RNF-10.
 * @example
 * await stopLspServers(SHUTDOWN_GRACE_MS);
 */
export async function stopLspServers(graceMs: number): Promise<void> {
  const stopping = [...clients.values()].map((client) => client.stop(graceMs));

  clients.clear();
  failures.clear();
  documents.clear();
  batcher?.flush();

  await Promise.all(stopping);
}

/** Levanta —o devuelve— el cliente de una definición. */
function clientFor(definition: LanguageServerDefinition): LanguageClient | null {
  const existing = clients.get(definition.serverId);

  if (existing !== undefined) return existing;
  if (failures.has(definition.serverId)) return null;
  if (!currentSettings().lsp.enabled) return null;

  const root = getWorkspace()?.root;

  if (root === undefined) return null;
  // Sin ninguna marca de raíz no hay proyecto de este lenguaje: levantar
  // `rust-analyzer` en una carpeta sin `Cargo.toml` son cientos de megabytes
  // para indexar nada.
  if (!hasRootMarker(root, definition.rootMarkers)) return null;

  return launch(definition, root);
}

/** Resuelve el ejecutable y las opciones, y arranca. Registra el fallo si no. */
function launch(definition: LanguageServerDefinition, root: string): LanguageClient | null {
  const settings = currentSettings();
  const resolved = resolveServerLaunch({
    definition,
    configuredPath: settings.lsp.serverPaths[definition.serverId] ?? null,
    appDirectory: app.getAppPath(),
    environment: process.env,
    execPath: process.execPath,
  });

  if ('problem' in resolved) return recordFailure(definition, resolved.problem.userMessage);

  const options = resolveInitializationOptions(definition, root);

  if ('problem' in options) return recordFailure(definition, options.problem.userMessage);

  const client = createLanguageClient({
    definition,
    launch: resolved.launch,
    root,
    initializationOptions: options.options,
    requestTimeoutMs: settings.lsp.requestTimeoutMs,
    onDiagnostics: (params) => {
      const document = toDocumentDiagnostics(params, settings.lsp.maxDiagnosticsPerFile);

      if (document !== null) batcher?.publish(definition.serverId, document);
    },
    onStatus: (status) => {
      // Un reinicio deja al servidor sin saber nada de los documentos que
      // tenía. Se los olvida acá y el renderer, que sí tiene el texto, los
      // reabre cuando ve el estado `running`.
      if (status.state !== 'running') documents.forgetServer(status.serverId);
      callbacks?.onStatus(status);
    },
  });

  clients.set(definition.serverId, client);
  client.start();

  return client;
}

/** Anota el fallo, lo publica y devuelve `null` para que quien pidió siga andando. */
function recordFailure(definition: LanguageServerDefinition, userMessage: string): null {
  const status: LspServerStatus = {
    serverId: definition.serverId,
    state: 'failed',
    userMessage,
  };

  failures.set(definition.serverId, status);
  callbacks?.onStatus(status);

  return null;
}

/** Si la raíz tiene alguna de las marcas de proyecto del lenguaje. */
function hasRootMarker(root: string, markers: readonly string[]): boolean {
  return markers.some((marker) => existsSync(join(root, marker)));
}
