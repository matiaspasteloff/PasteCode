import type { UpdateState } from '@pastecode/core';
import { canInstallInApp, initialUpdateState } from '@pastecode/core';
import {
  CheckForUpdateRequestSchema,
  DownloadUpdateRequestSchema,
  GetUpdateStateRequestSchema,
  InstallUpdateRequestSchema,
  OpenReleasePageRequestSchema,
} from '@pastecode/ipc-contract';
import { app, BrowserWindow, shell } from 'electron';

import { isSafeExternalUrl } from '../security/navigation.js';
import {
  detectInstallKind,
  loadElectronUpdaterBackend,
} from '../services/electron-updater-backend.js';
import { shutdownOnce } from '../services/quit.js';
import { currentSettings } from '../services/settings.js';
import { registerDisposer } from '../services/shutdown.js';
import type { UpdateService } from '../services/updater.js';
import { createUpdateService } from '../services/updater.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * Cuánto se espera después de mostrar la ventana para el primer chequeo.
 *
 * Diez segundos: lejos del arranque que mide RNF-01 y de la primera ráfaga de
 * trabajo del main (settings, extensiones, servidores de lenguaje), y lo
 * bastante pronto para que el aviso llegue en la misma sesión.
 */
const STARTUP_CHECK_DELAY_MS = 10_000;

/** El servicio, creado en el primer uso: necesita a `app` lista. */
let service: UpdateService | undefined;

/** El servicio de actualizaciones del proceso. */
function updates(): UpdateService {
  if (service !== undefined) return service;

  const platform =
    process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
  const kind = detectInstallKind(process.platform, app.isPackaged, process.env);
  const installable = canInstallInApp({ platform, arch: process.arch, kind });

  service = createUpdateService({
    initial: initialUpdateState(app.getVersion(), installable, app.isPackaged),
    loadBackend: loadElectronUpdaterBackend,
    channel: () => currentSettings().update.channel,
    onChange: broadcast,
  });
  return service;
}

/** Le cuenta el estado nuevo a la ventana, si hay una. */
function broadcast(state: UpdateState): void {
  const window = BrowserWindow.getAllWindows()[0];
  if (window !== undefined) emit(window, 'update:stateChanged', state);
}

/**
 * Registra los handlers del dominio `update`.
 *
 * `update:download` y `update:install` son las **únicas** dos puertas a
 * descargar e instalar, y las abre la UI cuando la persona lo pide. Instalar
 * apaga primero los procesos hijo (`shutdownOnce`) y recién después le pasa la
 * posta a electron-updater, que lanza el instalador y cierra la app.
 *
 * @example
 * registerUpdateIpcHandlers(); // antes de app.whenReady()
 */
export function registerUpdateIpcHandlers(): void {
  registerHandler('update:getState', GetUpdateStateRequestSchema, () => updates().getState());

  registerHandler('update:check', CheckForUpdateRequestSchema, () => updates().check());

  registerHandler('update:download', DownloadUpdateRequestSchema, () => updates().download());

  registerHandler('update:install', InstallUpdateRequestSchema, async () => {
    if (updates().getState().status !== 'downloaded') return {};
    await shutdownOnce();
    updates().install();
    return {};
  });

  registerHandler('update:openReleasePage', OpenReleasePageRequestSchema, () => {
    // La URL sale del estado del main, nunca del renderer, y pasa igual por
    // la misma guarda que cualquier enlace externo.
    const { releaseUrl } = updates().getState();
    if (isSafeExternalUrl(releaseUrl)) void shell.openExternal(releaseUrl);
    return {};
  });
}

/**
 * Agenda el primer chequeo, si las settings lo permiten.
 *
 * Diferido a propósito (`STARTUP_CHECK_DELAY_MS`): buscar una versión nueva no
 * puede competir con el arranque que mide RNF-01. Sin empaquetar no se agenda
 * nada: el estado es `unsupported` y no hay a quién preguntarle.
 *
 * @example
 * window.once('ready-to-show', scheduleStartupUpdateCheck);
 */
export function scheduleStartupUpdateCheck(): void {
  if (!app.isPackaged || !currentSettings().update.checkOnStartup) return;

  const timer = setTimeout(() => {
    void updates().check();
  }, STARTUP_CHECK_DELAY_MS);

  registerDisposer('update-startup-check', () => {
    clearTimeout(timer);
  });
}
