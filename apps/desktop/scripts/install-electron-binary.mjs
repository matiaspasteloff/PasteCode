/**
 * Descarga el binario de Electron después de instalar.
 *
 * Electron 43 dejó de traer un script de `postinstall` propio y expone la
 * descarga como el bin `install-electron`. El efecto práctico es que un
 * `pnpm install` limpio deja el paquete instalado pero sin `dist/`, y el
 * primer síntoma aparece recién al correr la app o el E2E, con un
 * "Electron failed to install correctly" que no dice qué hacer.
 *
 * El script de install.js ya es idempotente: si `dist/` está y la versión
 * coincide, no descarga nada.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

execFileSync(process.execPath, [require.resolve('electron/install.js')], {
  stdio: 'inherit',
});
