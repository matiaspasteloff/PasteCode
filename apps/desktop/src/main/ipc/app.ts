import { GetVersionRequestSchema, type Response } from '@pastecode/ipc-contract';
import { app, ipcMain } from 'electron';

/**
 * Registra los handlers del dominio `app`.
 *
 * `app:getVersion` es deliberadamente trivial. No está acá porque la app
 * necesite mostrar su versión, sino para recorrer la cadena completa
 * —contrato → handler con validación → preload → renderer → E2E— antes de que
 * la Etapa 2 la use para el filesystem, donde equivocarse cuesta caro.
 *
 * @example
 * registerAppIpcHandlers(); // antes de app.whenReady()
 */
export function registerAppIpcHandlers(): void {
  ipcMain.handle('app:getVersion', (_event, raw: unknown): Response<'app:getVersion'> => {
    // Un canal sin payload igual valida: el schema es estricto, así que mandar
    // datos de más es un error explícito y no algo que el handler ignora.
    GetVersionRequestSchema.parse(raw);

    return { version: app.getVersion() };
  });
}
