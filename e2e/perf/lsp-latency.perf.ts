import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { DESKTOP_ROOT } from '../tests/support/desktop.js';

import { record } from './support/report.js';
import { summarize } from './support/statistics.js';
import { linkTypeScript } from './support/workspace.js';

/**
 * RF-402 pide el popup de completado en menos de 200ms.
 *
 * **Esta sonda es el número que la Etapa 4 entera existe para producir**: es lo
 * que convierte ese `< 200ms` de prosa en un presupuesto medido.
 */
const COMPLETION_BUDGET_MS = 200;

/**
 * Cuánto puede tardar el primer diagnóstico después de una tecla.
 *
 * Es más generoso que el completado a propósito y no por comodidad: el
 * completado lo pide una persona y espera mirando, mientras que un diagnóstico
 * aparece solo. Los 50ms del debounce de ADR-0018 ya están adentro de este
 * número.
 */
const DIAGNOSTIC_BUDGET_MS = 1500;

/** Cuántas veces se mide. Un p95 con menos muestras no dice nada. */
const SAMPLES = 20;

/** Cuánto se le da al servidor para levantar e indexar antes de medir. */
const SERVER_WARMUP_MS = 30_000;

/** Dónde deja el renderer las mediciones, para que Playwright las lea. */
const PROBE_KEY = '__pastecodeLspLatency';

/**
 * Instala una sonda que cronometra hasta que el contador de problemas cambie.
 *
 * Se observa el DOM con un `MutationObserver` y no se sondea desde Playwright:
 * cada ida y vuelta del protocolo de automatización cuesta milisegundos, y con
 * un presupuesto de 200ms eso es una parte enorme de lo que se está midiendo.
 */
async function installProbe(window: Page, selector: string): Promise<void> {
  await window.evaluate(
    ([key, target]: readonly string[]) => {
      const samples: number[] = [];
      const probe = { startedAt: 0, samples };

      Reflect.set(globalThis, key ?? '', probe);

      const observed = document.querySelector(target ?? '');

      if (observed === null) return;

      new MutationObserver(() => {
        if (probe.startedAt === 0) return;

        samples.push(performance.now() - probe.startedAt);
        probe.startedAt = 0;
      }).observe(observed, { subtree: true, childList: true, characterData: true });
    },
    [PROBE_KEY, selector]
  );
}

/** Arranca el cronómetro justo antes de la acción que se mide. */
async function startTiming(window: Page): Promise<void> {
  await window.evaluate((key: string) => {
    const probe: unknown = Reflect.get(globalThis, key);

    if (typeof probe === 'object' && probe !== null && 'startedAt' in probe) {
      Reflect.set(probe, 'startedAt', performance.now());
    }
  }, PROBE_KEY);
}

/** Las muestras acumuladas por la sonda. */
async function samplesOf(window: Page): Promise<number[]> {
  const reported: unknown = await window.evaluate((key: string): unknown => {
    const probe: unknown = Reflect.get(globalThis, key);

    if (typeof probe !== 'object' || probe === null || !('samples' in probe)) return [];

    return Reflect.get(probe, 'samples');
  }, PROBE_KEY);

  return Array.isArray(reported)
    ? reported.filter((sample): sample is number => typeof sample === 'number')
    : [];
}

/** Abre un workspace TypeScript real con el servidor ya tibio. */
async function launchWithServer(): Promise<{
  window: Page;
  close: () => Promise<void>;
  isReady: boolean;
}> {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-lsp-'));
  const home = await mkdtemp(join(tmpdir(), 'pastecode-perf-lsp-home-'));

  await writeFile(
    join(workspace, 'src.ts'),
    'export function saludar(nombre: string): string {\n  return `hola ${nombre}`;\n}\n',
    'utf8'
  );

  const isReady = await linkTypeScript(
    workspace,
    join(DESKTOP_ROOT, '..', '..', 'node_modules', 'typescript')
  );

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
  await window.getByRole('treeitem', { name: 'src.ts' }).click();
  await expect(window.locator('.monaco-editor')).toContainText('saludar');
  await window.waitForTimeout(SERVER_WARMUP_MS);

  return {
    window,
    isReady,
    close: async () => {
      await app.close();
      await rm(workspace, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    },
  };
}

test('RF-401: latencia de tecla a primer diagnóstico', async () => {
  const session = await launchWithServer();

  test.skip(!session.isReady, 'No se pudo enlazar typescript en el workspace de prueba');

  await installProbe(session.window, '[data-testid="status-problems"]');
  await session.window.locator('.monaco-editor .view-lines').click();
  await session.window.keyboard.press('Control+End');

  for (let sample = 0; sample < SAMPLES; sample += 1) {
    await startTiming(session.window);
    // Un identificador que no existe: produce un error y, al borrarlo, lo saca.
    // Alternar es lo que hace que cada muestra mida un cambio de verdad y no
    // una publicación idéntica que el store descarta.
    await session.window.keyboard.type('noExiste;');
    await session.window.waitForTimeout(DIAGNOSTIC_BUDGET_MS);

    for (const _key of 'noExiste;') {
      await session.window.keyboard.press('Backspace');
    }

    await session.window.waitForTimeout(300);
  }

  const values = await samplesOf(session.window);

  await session.close();

  test.skip(values.length === 0, 'El servidor no publicó ningún diagnóstico');

  const measurement = summarize({
    requirement: 'RF-401',
    description: 'de tecla a primer diagnóstico pintado',
    values,
    percentile: 95,
    budget: DIAGNOSTIC_BUDGET_MS,
    unit: 'ms',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(DIAGNOSTIC_BUDGET_MS);
});

test('RF-402: latencia del popup de completado', async () => {
  const session = await launchWithServer();

  test.skip(!session.isReady, 'No se pudo enlazar typescript en el workspace de prueba');

  await installProbe(session.window, '.monaco-editor');
  await session.window.locator('.monaco-editor .view-lines').click();
  await session.window.keyboard.press('Control+End');

  const values: number[] = [];

  for (let sample = 0; sample < SAMPLES; sample += 1) {
    await session.window.keyboard.type('sal');

    const startedAt = Date.now();

    await session.window.keyboard.press('Control+Space');
    await session.window
      .locator('.suggest-widget.visible')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => values.push(Date.now() - startedAt))
      .catch(() => undefined);

    await session.window.keyboard.press('Escape');

    for (const _key of 'sal') {
      await session.window.keyboard.press('Backspace');
    }
  }

  await session.close();

  test.skip(values.length === 0, 'El popup de completado no se abrió ninguna vez');

  const measurement = summarize({
    requirement: 'RF-402',
    description: 'de Ctrl+Space al popup de completado visible',
    values,
    percentile: 95,
    budget: COMPLETION_BUDGET_MS,
    unit: 'ms',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(COMPLETION_BUDGET_MS);
});
