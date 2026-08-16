import type { WorkspaceInfo } from '@pastecode/ipc-contract';
import {
  GetWorkspaceRootRequestSchema,
  OpenWorkspaceRequestSchema,
} from '@pastecode/ipc-contract';
import type { OpenDialogOptions } from 'electron';
import { app, BrowserWindow, dialog } from 'electron';

import { stopLspServers } from '../lsp/registry.js';
import { setSettingsWorkspace } from '../services/settings.js';
import { SHUTDOWN_GRACE_MS } from '../services/shutdown.js';
import { getWorkspace, openWorkspaceAt } from '../services/workspace.js';

import { registerHandler } from './handler.js';
import { startWatchingWorkspace } from './watcher.js';

/**
 * Ruta de workspace con la que el E2E saltea el diálogo nativo.
 *
 * Playwright no puede manejar un diálogo del sistema operativo, así que sin
 * esto no habría forma de testear ningún flujo que empiece por abrir carpeta
 * —o sea, todos los de esta etapa.
 */
const E2E_WORKSPACE_VARIABLE = 'PASTECODE_E2E_WORKSPACE';

/**
 * Registra los handlers del dominio `workspace`.
 *
 * No hay unitarios para estos dos: uno abre un diálogo nativo y el otro es un
 * `getter`. El flujo entero —diálogo, servicio, IPC, store y pantalla— lo
 * ejerce el E2E `workspace.spec.ts`, que es donde tiene sentido probarlo.
 *
 * @example
 * registerWorkspaceIpcHandlers(); // antes de app.whenReady()
 */
export function registerWorkspaceIpcHandlers(): void {
  registerHandler('workspace:open', OpenWorkspaceRequestSchema, handleOpenWorkspace);
  registerHandler('workspace:getRoot', GetWorkspaceRootRequestSchema, getWorkspace);
}

/**
 * Abre el diálogo nativo de selección de carpeta.
 *
 * @returns El workspace abierto, o `null` si la persona canceló.
 */
async function handleOpenWorkspace(): Promise<WorkspaceInfo | null> {
  const chosen = await chooseDirectory();
  if (chosen === undefined) return null;

  // Antes de cambiar de raíz: un servidor de lenguaje está atado a la carpeta
  // con la que hizo el `initialize`, y hacerle preguntas sobre otra devuelve
  // respuestas de la anterior. Los del workspace nuevo se levantan solos con el
  // primer archivo que se abra.
  await stopLspServers(SHUTDOWN_GRACE_MS);

  const workspace = await openWorkspaceAt(chosen);

  // La capa de settings del workspace cambia con el workspace (RF-705). Va
  // acá y no adentro de `openWorkspaceAt` para que el servicio del workspace
  // siga sin saber que las settings existen.
  await setSettingsWorkspace(workspace.root);

  // RF-004. Va último y sin `await`: chokidar recorre el árbol para establecer
  // los watches, y nada de lo que produce hace falta antes del primer paint.
  // Ponerlo en el camino crítico gastaría el presupuesto de RNF-01 en algo que
  // nadie está esperando.
  startWatchingWorkspace(workspace.root);

  return workspace;
}

/** La carpeta elegida, o `undefined` si se canceló el diálogo. */
async function chooseDirectory(): Promise<string | undefined> {
  const forced = e2eWorkspace();
  if (forced !== undefined) return forced;

  const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options: OpenDialogOptions = { properties: ['openDirectory'] };

  // Con ventana el diálogo es modal y no se puede perder detrás de la app;
  // sin ella —que no debería pasar— sigue siendo mejor abrirlo que no hacer
  // nada.
  const result =
    owner === undefined
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(owner, options);

  if (result.canceled) return undefined;

  return result.filePaths[0];
}

/**
 * La ruta del flag de E2E, si corresponde usarla.
 *
 * El guard de `isPackaged` es lo que mantiene al `.exe` distribuido libre de
 * puertas de test: en un build empaquetado la variable se ignora, aunque
 * alguien la setee en la máquina del usuario. El E2E lanza `electron .` sin
 * empaquetar, así que le sirve igual.
 */
function e2eWorkspace(): string | undefined {
  if (app.isPackaged) return undefined;

  const configured = process.env[E2E_WORKSPACE_VARIABLE];

  return configured === undefined || configured === '' ? undefined : configured;
}
