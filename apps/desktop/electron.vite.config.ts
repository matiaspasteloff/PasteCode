import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/** Puerto del dev server. Ver el comentario de `strictPort` más abajo. */
const DEV_SERVER_PORT = 5173;

// Los paquetes del workspace se bundlean en vez de externalizarse: en el .exe
// empaquetado no existe un node_modules donde resolver `@pastecode/core`, así
// que dejarlos como externals produce un "Cannot find module" que sólo aparece
// después de instalar, nunca en desarrollo.
const WORKSPACE_PACKAGES = ['@pastecode/ipc-contract'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
    server: {
      port: DEV_SERVER_PORT,
      // Sin strictPort, Vite se corre al 5174 si el 5173 está ocupado. La CSP
      // y el bloqueo de `will-navigate` del main tienen el origen del dev
      // server en una allow-list, así que un puerto distinto no falla con un
      // mensaje claro: falla con la ventana en blanco y errores de CSP.
      // Preferimos que no arranque.
      strictPort: true,
    },
  },
});
