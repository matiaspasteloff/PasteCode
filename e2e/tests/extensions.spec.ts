import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT, makeTempDirectory } from './support/desktop.js';

let app: ElectronApplication;
let workspace: string;
let home: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-ext-ws-'));
  home = await makeTempDirectory('pastecode-ext-home-');

  await writeFile(join(workspace, 'notas.md'), '# Hola\n\nuno dos tres cuatro\n', 'utf8');

  // El tema se elige como cualquier otra preferencia, y se deja escrito **antes**
  // de arrancar: es el caso real de alguien que ya lo tiene configurado.
  await writeFile(
    join(home, 'settings.json'),
    JSON.stringify({ version: 1, window: { colorTheme: 'nord' } }),
    'utf8'
  );

  // Las extensiones son las del repositorio: en desarrollo el directorio de las
  // empaquetadas **es** `extensions/`, así que `word-count` y `theme-nord` son
  // las mismas que se distribuyen, ya compiladas por `pnpm build`.
  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace, PASTECODE_E2E_HOME: home },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/**
 * RF-904, RF-905 y RF-908 de punta a punta, con la extensión de verdad.
 *
 * Es el test que cierra el bloque de extensiones. `word-count` **no** se activa
 * al arrancar —declara `onLanguage:markdown`—, así que ver su número en la barra
 * prueba de una sola vez la cadena entera: el activation event disparó, el
 * módulo se importó, `activate` corrió, el registro cruzó al main, el main
 * verificó la capability, la contribución llegó al renderer, y la extensión
 * pidió el texto por el pull correlacionado y le volvió el contenido correcto.
 *
 * El número esperado es **seis**: `# Hola` son dos y `uno dos tres cuatro` son
 * cuatro. Que sea un número y no un "aparece algo" es el punto — un ítem vacío
 * también aparecería.
 */
test('word-count se activa con un markdown y cuenta lo que hay en el editor', async () => {
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  // Antes de abrir un markdown la extensión no se activó, así que no hay ítem.
  await expect(window.getByTestId('status-extension-word-count')).toBeHidden();

  await window.getByRole('treeitem', { name: 'notas.md' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('Hola');

  await expect(window.getByTestId('status-extension-word-count')).toHaveText('6 palabras', {
    timeout: 15_000,
  });
});

/**
 * RF-906 y RF-803: un tema aportado por una extensión repinta el IDE.
 *
 * `theme-nord` **no tiene código**: no declara `main`, así que el IDE nunca
 * importa ni ejecuta un módulo suyo. Que el fondo cambie prueba que una
 * extensión puede aportar sin ejecutar nada, que es la mitad interesante del
 * requerimiento.
 *
 * Se mide sobre la variable CSS y no sobre un píxel porque es donde vive la
 * decisión: todo el color del IDE sale de variables, así que pisarlas repinta
 * la aplicación entera sin re-renderizar un solo componente.
 */
test('theme-nord repinta la aplicación sin ejecutar código', async () => {
  const window = await app.firstWindow();

  await expect
    .poll(
      async () =>
        window.evaluate(
          `getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim()`
        ),
      { timeout: 15_000 }
    )
    .toBe('#2e3440');

  // La base sigue siendo el oscuro de fábrica: lo que el tema no pisa se
  // hereda, así que un tema parcial no deja la mitad de la UI sin colores.
  expect(await window.evaluate(`document.documentElement.dataset.theme`)).toBe('dark');
});
