import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { DESKTOP_ROOT } from '../tests/support/desktop.js';

import { record } from './support/report.js';
import { summarize } from './support/statistics.js';

/** RNF-01: p95 por debajo de 1,5 segundos. */
const BUDGET_MS = 1500;

/**
 * Cuántas veces se arranca la app.
 *
 * Veinte es lo que pide el plan de la etapa y no un número al azar: un p95
 * sobre menos de veinte muestras lo decide una sola corrida mala, y entonces
 * el presupuesto mide el ruido del runner en vez de la aplicación.
 */
const LAUNCHES = 20;

/**
 * Mide el arranque, N veces, y reporta el p95.
 *
 * Generaliza el test de una sola corrida que dejó la Etapa 2, incluido su
 * truco de warmup: en Windows, la primera vez que se abre un bundle recién
 * construido, el antivirus lo escanea entero. Eso mide al antivirus y no a la
 * app —en una instalación real el escaneo pasa una vez, no en cada arranque—.
 */
test('RNF-01: arranque', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-startup-'));
  const launch = async (): Promise<number> => {
    const startedAt = Date.now();
    const app = await electron.launch({
      args: [DESKTOP_ROOT],
      env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
    });

    await (await app.firstWindow()).getByRole('button', { name: 'Abrir carpeta' }).waitFor();

    const elapsed = Date.now() - startedAt;
    await app.close();

    return elapsed;
  };

  // La corrida de calentamiento se descarta: es la que paga el escaneo.
  await launch();

  const times: number[] = [];
  for (let run = 0; run < LAUNCHES; run += 1) times.push(await launch());

  const measurement = summarize({
    requirement: 'RNF-01',
    description: 'arranque hasta el primer contenido',
    values: times,
    percentile: 95,
    budget: BUDGET_MS,
    unit: 'ms',
  });

  await record(measurement);
  await rm(workspace, { recursive: true, force: true });

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_MS);
});
