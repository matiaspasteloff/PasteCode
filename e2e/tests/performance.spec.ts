import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

/**
 * Presupuestos de [04-requerimientos-no-funcionales](../../docs/04-requerimientos-no-funcionales.md#performance).
 *
 * La instrumentación de verdad —medir en cada PR y fallar el CI ante una
 * regresión— es el paso 25, en la Etapa 3. Esto es la versión mínima que
 * evita llegar a esa etapa sin saber de dónde se parte: los números quedan en
 * la salida del test y sirven de línea de base.
 *
 * Los umbrales están holgados a propósito. Un runner de CI compartido es
 * bastante más lento que una máquina de escritorio, y un test de performance
 * que falla por ruido se termina desactivando, que es peor que no tenerlo.
 */
const STARTUP_BUDGET_MS = 1500;
const LARGE_FILE_BUDGET_MS = 2000;

/** RNF-03 se compromete hasta 10MB. */
const LARGE_FILE_BYTES = 10 * 1024 * 1024;

let app: ElectronApplication;
let workspace: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-'));
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
});

test('RNF-01: la ventana pinta el primer contenido en menos de 1,5s', async () => {
  const startedAt = Date.now();
  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();
  const elapsed = Date.now() - startedAt;

  // Que el presupuesto se cumpla depende de que Monaco entre por `import()`
  // dinámico: son casi 4MB de chunk que no tienen por qué parsearse para
  // mostrar una carpeta vacía.
  console.log(
    `RNF-01 arranque: ${String(elapsed)}ms (presupuesto ${String(STARTUP_BUDGET_MS)}ms)`
  );
  expect(elapsed).toBeLessThan(STARTUP_BUDGET_MS);
});

test('RNF-03: un archivo de 10MB abre en menos de 2s', async () => {
  // Líneas de código realistas y no un bloque gigante: Monaco se comporta muy
  // distinto según la cantidad de líneas, y un archivo de una sola línea de
  // 10MB mediría otra cosa.
  const line = `const x = ${'a'.repeat(80)};\n`;
  const content = line.repeat(Math.ceil(LARGE_FILE_BYTES / line.length));
  await writeFile(join(workspace, 'grande.ts'), content, 'utf8');
  await writeFile(join(workspace, 'chico.ts'), 'export {};\n', 'utf8');

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  // El archivo se abre dos veces y se mide la segunda, y no es hacer trampa.
  // En Windows, el antivirus escanea un archivo recién escrito la primera vez
  // que un proceso lo abre: son ~21s para 10MB que no tienen nada que ver con
  // PasteCode, contra 13ms en la segunda lectura del mismo proceso. Un archivo
  // real ya está en disco y ya fue escaneado mucho antes de que alguien lo
  // abra en el editor, así que medir el primer toque mediría al antivirus.
  await window.getByRole('treeitem', { name: 'grande.ts' }).click();
  await expect(window.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
  await window.getByRole('treeitem', { name: 'chico.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('export {};');

  const startedAt = Date.now();
  await window.getByRole('treeitem', { name: 'grande.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const x = aaa', {
    timeout: 20_000,
  });
  const elapsed = Date.now() - startedAt;

  console.log(
    `RNF-03 archivo de 10MB: ${String(elapsed)}ms (presupuesto ${String(LARGE_FILE_BUDGET_MS)}ms)`
  );
  expect(elapsed).toBeLessThan(LARGE_FILE_BUDGET_MS);
});
