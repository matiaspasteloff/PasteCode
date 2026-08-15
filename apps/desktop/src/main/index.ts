import { app, BrowserWindow } from 'electron';

import { registerAppIpcHandlers } from './ipc/app.js';
import { registerFsIpcHandlers } from './ipc/fs.js';
import { createMainWindow } from './windows/create-window.js';

registerAppIpcHandlers();
registerFsIpcHandlers();

void app.whenReady().then(() => {
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
