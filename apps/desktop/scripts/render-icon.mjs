// Rasteriza `build/icon.svg` a `build/icon.png` (1024×1024, con alfa).
//
// Corre **dentro de Electron** (`electron scripts/render-icon.mjs`, ver el
// script `icon` del package.json): el Chromium que ya viene con la app
// rasteriza el SVG igual que cualquier navegador, y así no hace falta una
// dependencia de imágenes ni descargar un navegador de Playwright. Se usa
// renderizado offscreen porque devuelve exactamente los píxeles pedidos, sin
// depender del factor de escala de la pantalla.
//
// No corre en el CI ni en el empaquetado: el PNG se versiona. Se vuelve a
// correr sólo cuando cambia el SVG.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

const SIZE = 1024;
const buildDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');

/** Carga el SVG en una ventana invisible y devuelve su captura en PNG. */
async function render() {
  const svg = readFileSync(join(buildDirectory, 'icon.svg'), 'utf8');
  const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`;
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  await window.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  const image = await window.webContents.capturePage();
  const { width, height } = image.getSize();
  if (width !== SIZE || height !== SIZE) {
    throw new Error(`La captura salió de ${width}×${height} y no de ${SIZE}×${SIZE}`);
  }
  return image.toPNG();
}

app.disableHardwareAcceleration();
// Con `.then` y no con un `await` de nivel superior: Electron espera a que el
// módulo de entrada termine de evaluarse antes de emitir `ready`, así que
// esperarlo desde ahí no vuelve nunca.
void app.whenReady().then(async () => {
  try {
    writeFileSync(join(buildDirectory, 'icon.png'), await render());
    process.stdout.write(`icon.png generado (${SIZE}×${SIZE})\n`);
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    app.exit(1);
  }
});
