import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';

import { isDevelopment } from './environment.js';
import { registerAppIpcHandlers } from './ipc/app.js';
import { registerFsIpcHandlers } from './ipc/fs.js';
import { registerWorkspaceIpcHandlers } from './ipc/workspace.js';
import { registerAppScheme, serveRendererFrom } from './windows/app-protocol.js';
import { createMainWindow } from './windows/create-window.js';

// Antes que nada: Electron exige que los privilegios del esquema se declaren
// antes de que la app esté lista, y hacerlo tarde falla en silencio.
registerAppScheme();

registerAppIpcHandlers();
registerFsIpcHandlers();
registerWorkspaceIpcHandlers();

void app.whenReady().then(() => {
  // En desarrollo el renderer lo sirve Vite con su HMR; el esquema propio sólo
  // hace falta para el build empaquetado.
  if (!isDevelopment) serveRendererFrom(join(__dirname, '../renderer'));

  createMainWindow();

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
