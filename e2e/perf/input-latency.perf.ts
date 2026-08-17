import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { DESKTOP_ROOT } from '../tests/support/desktop.js';

import { record } from './support/report.js';
import { summarize } from './support/statistics.js';
import { linkTypeScript, writeUserSettings } from './support/workspace.js';

/** Cuánto se le da al servidor de lenguaje para levantar antes de tipear. */
const SERVER_WARMUP_MS = 20_000;

/** RNF-02: p99 por debajo de un frame a 60Hz. */
const BUDGET_MS = 16;

/** Cuántas teclas se escriben. Un p99 necesita bastantes muestras. */
const KEYSTROKES = 120;

/** Dónde deja el renderer las mediciones, para que Playwright las lea. */
const SAMPLES_KEY = '__pastecodeLatency';

/**
 * Instala la sonda en el renderer.
 *
 * En captura, para medir desde que el evento entra al documento y antes de que
 * ningún manejador de la aplicación lo haya visto.
 */
async function installProbe(window: Page): Promise<void> {
  await window.evaluate((key: string) => {
    const samples: number[] = [];

    Reflect.set(globalThis, key, samples);

    document.addEventListener(
      'keydown',
      () => {
        const pressedAt = performance.now();

        requestAnimationFrame(() => {
          samples.push(performance.now() - pressedAt);
        });
      },
      { capture: true }
    );
  }, SAMPLES_KEY);
}

/** Trae las mediciones del renderer, verificando que sean números. */
async function collectSamples(window: Page): Promise<number[]> {
  const reported: unknown = await window.evaluate((key: string): unknown => {
    const samples: unknown = Reflect.get(globalThis, key);

    return Array.isArray(samples) ? samples : [];
  }, SAMPLES_KEY);

  if (!Array.isArray(reported) || reported.length === 0) {
    throw new Error('El renderer no reportó ninguna medición de latencia');
  }

  return reported.filter((sample): sample is number => typeof sample === 'number');
}

/**
 * Mide cuánto tarda una tecla en llegar a la pantalla.
 *
 * Se mide **de `keydown` al frame siguiente**, no al `keyup` ni al cambio del
 * modelo: lo que alguien percibe como latencia es el tiempo hasta ver la letra,
 * y eso sólo termina cuando el navegador pinta. `requestAnimationFrame` corre
 * justo antes de ese pintado, que es lo más cerca que se puede medir desde
 * JavaScript.
 *
 * La medición se instala en el renderer y no se calcula desde Playwright a
 * propósito: el ida y vuelta del protocolo de automatización es de milisegundos
 * y arruinaría un presupuesto de dieciséis.
 */
/** Escribe `KEYSTROKES` teclas en el editor y devuelve las latencias. */
async function typeAndCollect(window: Page): Promise<number[]> {
  await window.locator('.monaco-editor .view-lines').click();
  await window.keyboard.press('Control+End');

  await installProbe(window);

  for (let stroke = 0; stroke < KEYSTROKES; stroke += 1) {
    await window.keyboard.type('a');
  }

  return collectSamples(window);
}

test('RNF-02: latencia de input sin servidores de lenguaje', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-input-'));
  const home = await mkdtemp(join(tmpdir(), 'pastecode-perf-input-home-'));

  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');
  await writeUserSettings(home, { lsp: { enabled: false } });

  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: {
      ...process.env,
      PASTECODE_E2E_WORKSPACE: workspace,
      PASTECODE_E2E_HOME: home,
    },
  });
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const uno = 1;');

  const values = await typeAndCollect(window);

  await app.close();
  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });

  const measurement = summarize({
    requirement: 'RNF-02',
    description: 'latencia de tecla a frame, sin LSP',
    values,
    percentile: 99,
    budget: BUDGET_MS,
    unit: 'ms',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_MS);
});

/**
 * El mismo número, con el servidor de lenguaje andando.
 *
 * **Es el escenario que importa desde la Etapa 4.** Sin él, la sonda sigue
 * midiendo el mundo pre-LSP y pasando: la sincronización de documentos de
 * ADR-0018 corre en cada tecla —acumula, agenda, y cada 50ms cruza el IPC— y
 * si algo de eso se hiciera mal, el escenario de arriba no se enteraría.
 */
test('RNF-02: latencia de input con TypeScript activo', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-input-lsp-'));
  const home = await mkdtemp(join(tmpdir(), 'pastecode-perf-input-lsp-home-'));

  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');

  const isLinked = await linkTypeScript(
    workspace,
    join(DESKTOP_ROOT, '..', '..', 'node_modules', 'typescript')
  );

  test.skip(!isLinked, 'No se pudo enlazar typescript en el workspace de prueba');

  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: {
      ...process.env,
      PASTECODE_E2E_WORKSPACE: workspace,
      PASTECODE_E2E_HOME: home,
    },
  });
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const uno = 1;');

  await window.waitForTimeout(SERVER_WARMUP_MS);

  const values = await typeAndCollect(window);

  await app.close();
  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });

  const measurement = summarize({
    requirement: 'RNF-02',
    description: 'latencia de tecla a frame, con tsserver activo',
    values,
    percentile: 99,
    budget: BUDGET_MS,
    unit: 'ms',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_MS);
});
