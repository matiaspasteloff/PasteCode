import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT } from '../tests/support/desktop.js';

import { record } from './support/report.js';
import { summarize } from './support/statistics.js';
import { createPerfWorkspace, linkTypeScript, writeUserSettings } from './support/workspace.js';

/** RNF-04, escenario base: sin servidores de lenguaje. */
const BUDGET_WITHOUT_LSP_MB = 400;

/**
 * RNF-04, escenario con TypeScript activo.
 *
 * `tsserver` sobre un proyecto real ocupa 150-300MB **él solo**. El presupuesto
 * se partió en dos justamente para no tener que elegir entre un techo
 * incumplible en cuanto alguien abre un `.ts` y uno que no diga nada sobre la
 * aplicación sin LSP. Ver
 * [ADR-0021](../../docs/adr/0021-presupuesto-de-ram-partido.md).
 */
const BUDGET_WITH_TYPESCRIPT_MB = 700;

/** El workspace que pide el requerimiento. */
const FILE_COUNT = 1000;

/** Cuánto se le da al servidor para levantar e indexar antes de medir. */
const SERVER_WARMUP_MS = 20_000;

/**
 * La memoria de todos los procesos de la aplicación, en MB.
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
 */
async function totalMemoryMb(app: ElectronApplication): Promise<number> {
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

  if (typeof reported !== 'number') {
    throw new Error('getAppMetrics no devolvió un total de memoria');
  }

  return reported / 1024;
}

/**
 * Abre el workspace, tres pestañas, y devuelve cuánta memoria ocupa todo.
 *
 * Una sola muestra y no un percentil: la memoria no fluctúa entre corridas
 * como la latencia, y veinte arranques con mil archivos cada uno costarían
 * minutos de CI para afinar un número que no se mueve.
 */
async function measure(options: {
  workspace: string;
  home: string;
  warmUpMs: number;
}): Promise<number> {
  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: {
      ...process.env,
      PASTECODE_E2E_WORKSPACE: options.workspace,
      PASTECODE_E2E_HOME: options.home,
    },
  });
  const window = await app.firstWindow();

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'src' }).click();

  // Tres pestañas, como pide el requerimiento.
  for (const index of [0, 1, 2]) {
    await window.getByRole('treeitem', { name: `archivo-${String(index)}.ts` }).click();
    await expect(window.locator('.monaco-editor')).toContainText(`valor${String(index)}`);
  }

  await window.waitForTimeout(options.warmUpMs);

  const total = await totalMemoryMb(app);

  await app.close();

  return total;
}

test('RNF-04: memoria sin servidores de lenguaje', async () => {
  const workspace = await createPerfWorkspace(FILE_COUNT);
  const home = await mkdtemp(join(tmpdir(), 'pastecode-perf-home-'));

  // Es el escenario de arrancar y mirar archivos, que es como la aplicación
  // pasa buena parte del tiempo. Sin este número, una regresión de 200MB en el
  // cascarón entraría escondida abajo del techo del escenario con LSP.
  await writeUserSettings(home, { lsp: { enabled: false } });

  const total = await measure({ workspace, home, warmUpMs: 1000 });

  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });

  const measurement = summarize({
    requirement: 'RNF-04',
    description: `memoria con ${String(FILE_COUNT)} archivos, 3 pestañas y el LSP apagado`,
    values: [total],
    percentile: 100,
    budget: BUDGET_WITHOUT_LSP_MB,
    unit: 'MB',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_WITHOUT_LSP_MB);
});

test('RNF-04: memoria con el servidor de TypeScript tibio', async () => {
  const workspace = await createPerfWorkspace(FILE_COUNT);
  const home = await mkdtemp(join(tmpdir(), 'pastecode-perf-home-lsp-'));
  const isLinked = await linkTypeScript(
    workspace,
    join(DESKTOP_ROOT, '..', '..', 'node_modules', 'typescript')
  );

  // Sin `typescript` en el workspace el servidor no arranca —el `tsserver` sale
  // de ahí, por ADR-0017— así que la medición sería la del escenario anterior
  // con otro nombre. Es mejor saltearla que reportar un número que miente.
  test.skip(!isLinked, 'No se pudo enlazar typescript en el workspace de prueba');

  const total = await measure({ workspace, home, warmUpMs: SERVER_WARMUP_MS });

  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });

  const measurement = summarize({
    requirement: 'RNF-04',
    description: `memoria con ${String(FILE_COUNT)} archivos, 3 pestañas y tsserver activo`,
    values: [total],
    percentile: 100,
    budget: BUDGET_WITH_TYPESCRIPT_MB,
    unit: 'MB',
  });

  await record(measurement);

  expect(measurement.value).toBeLessThanOrEqual(BUDGET_WITH_TYPESCRIPT_MB);
});
