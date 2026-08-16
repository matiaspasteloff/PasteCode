import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { DESKTOP_ROOT } from '../tests/support/desktop.js';

import { record } from './support/report.js';
import { summarize } from './support/statistics.js';

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
test('RNF-02: latencia de input', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-input-'));
  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');

  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('const uno = 1;');

  await window.locator('.monaco-editor .view-lines').click();
  await window.keyboard.press('Control+End');

  await installProbe(window);

  for (let stroke = 0; stroke < KEYSTROKES; stroke += 1) {
    await window.keyboard.type('a');
  }

  const values = await collectSamples(window);

  await app.close();
  await rm(workspace, { recursive: true, force: true });
  const measurement = summarize({
    requirement: 'RNF-02',
    description: 'latencia de tecla a frame',
    values,
    percentile: 99,
    budget: BUDGET_MS,
    unit: 'ms',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_MS);
});
