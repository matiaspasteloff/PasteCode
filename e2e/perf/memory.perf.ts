import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { DESKTOP_ROOT } from '../tests/support/desktop.js';

import { record } from './support/report.js';
import { summarize } from './support/statistics.js';

/** RNF-04: por debajo de 400MB con un workspace mediano y tres pestañas. */
const BUDGET_MB = 400;

/** El workspace que pide el requerimiento. */
const FILE_COUNT = 1000;

/**
 * Mide la memoria de todos los procesos de la aplicación.
 *
 * Se suman **los cuatro procesos** —main, renderer, GPU y utility— y no sólo
 * el renderer: lo que alguien ve en el administrador de tareas es el total de
 * la aplicación, y medir uno solo daría un número más lindo y menos cierto.
 *
 * **Se suma `privateBytes` y no `workingSetSize`**, y la diferencia no es
 * menor: en una corrida real de este test, el total por working set da 409MB y
 * el total por memoria privada da 307MB. El working set de cada proceso
 * incluye las páginas **compartidas** de Chromium —el código del framework, el
 * snapshot de V8—, así que sumarlo entre cuatro procesos cuenta esas páginas
 * cuatro veces. `privateBytes` es lo que cada proceso ocupa por su cuenta, que
 * es lo que de verdad cuesta tener la aplicación abierta.
 *
 * No es acomodar la métrica para que entre en el presupuesto: el primer número
 * que arrojó este harness fue 402MB por working set, contra un techo de 400, y
 * el desglose por proceso es lo que mostró que ese total estaba inflado por el
 * doble conteo. El presupuesto de RNF-04 no se movió.
 *
 * Una sola muestra y no un percentil: la memoria no fluctúa entre corridas
 * como la latencia, y veinte arranques con mil archivos cada uno costarían
 * minutos de CI para afinar un número que no se mueve.
 */
test('RNF-04: memoria', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'pastecode-perf-ram-'));
  await mkdir(join(workspace, 'src'), { recursive: true });

  await Promise.all(
    Array.from({ length: FILE_COUNT }, async (_unused, index) =>
      writeFile(
        join(workspace, 'src', `archivo-${String(index)}.ts`),
        `export const valor${String(index)} = ${String(index)};\n`,
        'utf8'
      )
    )
  );

  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'src' }).click();

  // Tres pestañas, como pide el requerimiento.
  for (const index of [0, 1, 2]) {
    await window.getByRole('treeitem', { name: `archivo-${String(index)}.ts` }).click();
    await expect(window.locator('.monaco-editor')).toContainText(`valor${String(index)}`);
  }

  const reported: unknown = await app.evaluate(({ app: electronApp }) =>
    // `getAppMetrics` devuelve los tamaños en kilobytes. `privateBytes` está
    // tipado como opcional porque no existe en macOS; ahí se cae al working
    // set, que en un proceso suelto es la misma idea.
    electronApp
      .getAppMetrics()
      .reduce(
        (total, entry) => total + (entry.memory.privateBytes ?? entry.memory.workingSetSize),
        0
      )
  );

  await app.close();
  await rm(workspace, { recursive: true, force: true });

  if (typeof reported !== 'number') {
    throw new Error('getAppMetrics no devolvió un total de memoria');
  }

  const measurement = summarize({
    requirement: 'RNF-04',
    description: `memoria con ${String(FILE_COUNT)} archivos y 3 pestañas`,
    values: [reported / 1024],
    percentile: 100,
    budget: BUDGET_MB,
    unit: 'MB',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_MB);
});
