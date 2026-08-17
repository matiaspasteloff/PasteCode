import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/** Puerto del dev server. Ver el comentario de `strictPort` más abajo. */
const DEV_SERVER_PORT = 5173;

// Los paquetes del workspace se bundlean en vez de externalizarse: en el .exe
// empaquetado no existe un node_modules donde resolver `@pastecode/core`, así
// que dejarlos como externals produce un "Cannot find module" que sólo aparece
// después de instalar, nunca en desarrollo.
const WORKSPACE_PACKAGES = ['@pastecode/core', '@pastecode/ipc-contract'];

// Lo mismo, pero para una dependencia de verdad. `chokidar` lo importa el main,
// así que externalizarlo lo deja como un `require` que dentro del asar no
// resuelve: la app instalada moría al arrancar con "Cannot find module
// 'chokidar'" mientras `pnpm dev` y los E2E —que corren sobre `out/`, con el
// node_modules al lado— pasaban sin una queja.
//
// Se bundlea en vez de agregarlo a `files` de electron-builder.yml porque es JS
// puro: así no hay que acordarse de arrastrar también a `readdirp`, su única
// dependencia, ni a lo que `readdirp` sume mañana. Lo que **no** se puede
// bundlear es node-pty, que es un binario nativo, ni ripgrep, que es un
// ejecutable; ésos sí viajan como módulos y están declarados allá.
const BUNDLED_DEPENDENCIES = ['chokidar'];

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: [...WORKSPACE_PACKAGES, ...BUNDLED_DEPENDENCIES] }),
    ],
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
      // electron-vite no minifica por defecto, y sin esto Monaco solo son
      // 7,5MB de JavaScript con nombres largos y saltos de línea dentro del
      // .exe. RNF-05 pone el techo del instalador en 120MB.
      minify: 'esbuild',
      // El outDir está fuera del root del renderer, así que Vite se niega a
      // vaciarlo por las suyas y los chunks viejos se acumulan entre builds.
      // Sin esto, los 18MB de workers que este PR sacó seguirían apareciendo
      // en el paquete.
      emptyOutDir: true,
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
