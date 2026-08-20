import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';

import { dataDirectoryOverride, isDevelopment } from './environment.js';
import { useExtensionsDirectory } from './extensions/directories.js';
import { registerAppIpcHandlers } from './ipc/app.js';
import { registerBackupsIpcHandlers } from './ipc/backups.js';
import { registerClipboardIpcHandlers } from './ipc/clipboard.js';
import { registerExtensionsIpcHandlers, startExtensionHost } from './ipc/extensions.js';
import { registerFsIpcHandlers } from './ipc/fs.js';
import { registerGitIpcHandlers } from './ipc/git.js';
import { registerKeybindingsIpcHandlers, startKeybindings } from './ipc/keybindings.js';
import { registerLspIpcHandlers } from './ipc/lsp.js';
import { registerSearchIpcHandlers } from './ipc/search.js';
import { flushSession, registerSessionIpcHandlers } from './ipc/session.js';
import { registerSettingsIpcHandlers, startSettings } from './ipc/settings.js';
import { registerTerminalIpcHandlers } from './ipc/terminal.js';
import { registerWatcherDisposer } from './ipc/watcher.js';
import { registerWorkspaceIpcHandlers } from './ipc/workspace.js';
import { useBackupDirectory } from './services/backups.js';
import { useSessionDirectory } from './services/session.js';
import { disposeAll } from './services/shutdown.js';
import { registerAppScheme, serveRendererFrom } from './windows/app-protocol.js';
import { createMainWindow } from './windows/create-window.js';

// Antes que nada: Electron exige que los privilegios del esquema se declaren
// antes de que la app esté lista, y hacerlo tarde falla en silencio.
registerAppScheme();

registerAppIpcHandlers();
registerFsIpcHandlers();
registerBackupsIpcHandlers();
registerExtensionsIpcHandlers();
registerWorkspaceIpcHandlers();
registerTerminalIpcHandlers();
registerClipboardIpcHandlers();
registerSettingsIpcHandlers();
registerKeybindingsIpcHandlers();
registerSessionIpcHandlers();
registerSearchIpcHandlers();
registerLspIpcHandlers();
registerGitIpcHandlers();
registerWatcherDisposer();

/**
 * Si la salida ya se está ejecutando. Sin esto, el `app.quit()` de abajo
 * vuelve a disparar `before-quit` y la app queda sin poder cerrarse.
 */
let quitting = false;

// RNF-10 y RF-305: cero procesos huérfanos. `before-quit` es el único gancho
// que corre antes de que Electron empiece a destruir ventanas, y se cancela
// para tener tiempo de matar a los hijos: si se dejara seguir, el proceso del
// main muere primero y los PTY quedan adoptados por el sistema.
app.on('before-quit', (event) => {
  if (quitting) return;

  quitting = true;
  event.preventDefault();

  // La sesión primero: es lo más barato y lo que más se nota si se pierde
  // (RF-707). Después, todos los subsistemas que registraron cómo apagarse,
  // en paralelo y contra una sola ventana de gracia. Acá no hay una lista de
  // subsistemas a propósito: la lista escrita a mano era lo que dejaba a
  // ripgrep afuera.
  void flushSession()
    .catch(() => undefined)
    .then(() => disposeAll())
    .finally(() => {
      app.quit();
    });
});

void app.whenReady().then(async () => {
  // Antes de la ventana: el renderer pide `settings:get` apenas monta, y
  // servirle los defaults para corregirlos un tick después es un parpadeo de
  // tema y de tamaño de fuente en cada arranque.
  if (dataDirectoryOverride !== undefined) {
    useSessionDirectory(join(dataDirectoryOverride, 'workspaces'));
    useBackupDirectory(join(dataDirectoryOverride, 'backups'));
    useExtensionsDirectory(join(dataDirectoryOverride, 'extensions'));
  }

  await startSettings(dataDirectoryOverride);
  await startKeybindings(dataDirectoryOverride);

  // En desarrollo el renderer lo sirve Vite con su HMR; el esquema propio sólo
  // hace falta para el build empaquetado.
  if (!isDevelopment) serveRendererFrom(join(__dirname, '../renderer'));

  createMainWindow();

  // **Después** de la ventana, y no antes. El host publica lo que cargó por
  // `extensions:changed`, y un evento emitido cuando todavía no hay ninguna
  // ventana no lo recibe nadie: se pierde y la UI queda mostrando cero
  // extensiones para siempre. De paso, la ventana pinta sin esperar a que se
  // forkee un proceso, que es lo que RNF-01 mide.
  startExtensionHost();

  app.on('activate', () => {
    // macOS: hacer click en el ícono del dock con la app abierta y sin
    // ventanas reabre una, en vez de no hacer nada.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // En macOS la convención es que la app siga viva sin ventanas.
  if (process.platform !== 'darwin') app.quit();
});
