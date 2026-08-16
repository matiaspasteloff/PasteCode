import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Measurement } from './statistics.js';

/** Dónde queda el JSON con los números de la corrida. */
const REPORT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'perf-report.json'
);

/**
 * Guarda una medición y la deja en el resumen del CI.
 *
 * El JSON existe para que el paso siguiente del workflow lo pueda leer sin
 * volver a correr nada, y para que un humano pueda comparar dos corridas sin
 * leer logs. El `$GITHUB_STEP_SUMMARY` existe porque el número tiene que estar
 * donde alguien lo va a ver —la pestaña del job— y no enterrado en la salida.
 *
 * Se **acumula** en vez de reescribir: cada archivo de la carpeta mide un
 * requerimiento distinto y todos corren en el mismo job.
 *
 * @param measurement Lo que se acaba de medir.
 * @example
 * await record(summarize({ requirement: 'RNF-01', ... }));
 */
export async function record(measurement: Measurement): Promise<void> {
  const existing = await readReport();

  await writeFile(
    REPORT_PATH,
    `${JSON.stringify([...existing, measurement], null, 2)}\n`,
    'utf8'
  );

  // También a la consola: en local no hay `$GITHUB_STEP_SUMMARY` y el número
  // tiene que verse igual. `warn` y no `log` porque es lo que la regla de
  // `no-console` deja pasar, y acá no hay nada que ocultar.
  console.warn(formatLine(measurement));

  await appendToStepSummary(measurement);
}

/** Lo que ya se registró en esta corrida. */
async function readReport(): Promise<Measurement[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(REPORT_PATH, 'utf8'));

    return Array.isArray(parsed) ? parsed.filter(isMeasurement) : [];
  } catch {
    // Primera medición de la corrida, o un archivo de una corrida anterior que
    // quedó a medias. En los dos casos se empieza de cero.
    return [];
  }
}

/** Verifica la forma sin aserciones: el archivo viene del disco. */
function isMeasurement(value: unknown): value is Measurement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requirement' in value &&
    'value' in value &&
    'budget' in value
  );
}

/** Una línea legible, con el veredicto. */
function formatLine(measurement: Measurement): string {
  const verdict = measurement.value <= measurement.budget ? 'OK' : 'EXCEDIDO';

  return `${measurement.requirement} ${measurement.description}: ${String(measurement.value)}${measurement.unit} (presupuesto ${String(measurement.budget)}${measurement.unit}, ${String(measurement.samples)} muestras) — ${verdict}`;
}

/**
 * Agrega una fila a la tabla del resumen del job.
 *
 * El encabezado se escribe una sola vez, la primera vez que el archivo no
 * existe o está vacío. GitHub concatena todo lo que se le escriba, así que
 * repetirlo produciría una tabla rota.
 */
async function appendToStepSummary(measurement: Measurement): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath === undefined || summaryPath === '') return;

  await mkdir(dirname(summaryPath), { recursive: true }).catch(() => undefined);

  const isEmpty = await readFile(summaryPath, 'utf8')
    .then((content) => !content.includes('| Requerimiento |'))
    .catch(() => true);

  const header = isEmpty
    ? '## Presupuestos de performance\n\n| Requerimiento | Qué mide | Medido | Presupuesto | Muestras | |\n| --- | --- | ---: | ---: | ---: | --- |\n'
    : '';

  const passed = measurement.value <= measurement.budget;
  const row = `| ${measurement.requirement} | ${measurement.description} | ${String(measurement.value)}${measurement.unit} | ${String(measurement.budget)}${measurement.unit} | ${String(measurement.samples)} | ${passed ? '✅' : '❌'} |\n`;

  await appendFile(summaryPath, `${header}${row}`, 'utf8');
}
