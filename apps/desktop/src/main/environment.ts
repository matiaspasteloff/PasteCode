import { app } from 'electron';

/**
 * URL del dev server de Vite, o `undefined` en un build de producción.
 * electron-vite define `ELECTRON_RENDERER_URL` únicamente cuando levanta el
 * dev server.
 */
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

/**
 * Si la app corre en desarrollo.
 *
 * La condición lleva `!app.isPackaged` además de la variable de entorno, y no
 * es redundante: toda la política de seguridad relajada —CSP con `unsafe-eval`,
 * navegación permitida hacia localhost— cuelga de este booleano. Sin
 * `isPackaged`, cualquiera que pueda setear una variable de entorno en la
 * máquina de un usuario le baja las defensas a la app instalada.
 */
export const isDevelopment = !app.isPackaged && rendererDevUrl !== undefined;

/** URL que carga la ventana en desarrollo. `undefined` en producción. */
export const devServerUrl = isDevelopment ? rendererDevUrl : undefined;

/**
 * Origen del dev server (`http://localhost:5173`), sin path.
 * Es lo que consumen la CSP y el bloqueo de navegación.
 */
export const devServerOrigin =
  devServerUrl !== undefined ? new URL(devServerUrl).origin : undefined;
