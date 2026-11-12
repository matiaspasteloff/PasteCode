/**
 * Mide los instaladores de un directorio de salida de electron-builder y hace
 * cumplir RNF-05 donde corresponde.
 *
 *     node scripts/check-installer-size.mjs <directorio> <win32|darwin|linux> <x64|arm64>
 *
 * Reemplaza el paso de PowerShell que vivía en `ci.yml`, que sólo sabía de un
 * `.exe`. Ahora hay siete artefactos en tres sistemas, y el techo de 120MB de
 * RNF-05 se escribió pensando en el instalador de Windows:
 *
 * - **Windows**: el techo se hace cumplir, para el instalador y para el
 *   portable —los dos son un `.exe` que alguien baja—. Pasarse falla el job.
 * - **macOS y Linux**: se mide y se reporta, sin techo. Un `.dmg` y un AppImage
 *   no comprimen igual que NSIS, y fijar un número antes de tener el primero
 *   sería inventarlo; el techo se propone en la documentación con la primera
 *   medición real.
 *
 * Cada artefacto deja una fila en `$GITHUB_STEP_SUMMARY`, si existe, y una
 * línea en la salida estándar siempre.
 */
import { appendFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** RNF-05, en MB de 1024×1024: el mismo `1MB` del paso de PowerShell anterior. */
const BUDGET_MB = 120;

/** Lo que cuenta como instalador. Los `.yml` y `.blockmap` no se miden. */
const INSTALLER_EXTENSIONS = ['.exe', '.dmg', '.zip', '.AppImage', '.deb'];

/** Los instaladores del directorio, sin bajar a los subdirectorios desempaquetados. */
function installers(directory) {
  return readdirSync(directory)
    .filter((name) => INSTALLER_EXTENSIONS.some((extension) => name.endsWith(extension)))
    .sort()
    .map((name) => ({ name, megabytes: statSync(join(directory, name)).size / 1024 / 1024 }));
}

/** La fila de la tabla y si el artefacto se pasa del techo. */
function measure({ name, megabytes }, enforced) {
  const size = `${megabytes.toFixed(1)}MB`;
  const over = enforced && megabytes > BUDGET_MB;
  const budget = enforced ? `${BUDGET_MB}MB` : 'sin techo';
  const status = enforced ? (over ? '❌' : '✅') : 'medido';
  return { over, row: `| RNF-05 | \`${name}\` | ${size} | ${budget} | ${status} |`, size };
}

/** La tabla en el resumen del job, si corre en Actions, y una línea por artefacto. */
function report(measured, platform, arch, enforced) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary !== undefined && summary !== '') {
    const header = `### Tamaño de los instaladores (${platform}-${arch})\n\n| Requerimiento | Artefacto | Medido | Presupuesto | |\n| --- | --- | ---: | ---: | --- |\n`;
    appendFileSync(summary, `${header}${measured.map((item) => item.row).join('\n')}\n\n`);
  }

  const budget = enforced ? ` (presupuesto ${BUDGET_MB}MB)` : '';
  for (const item of measured) console.log(`RNF-05 ${item.name}: ${item.size}${budget}`);
}

function main([directory, platform, arch]) {
  if (directory === undefined || platform === undefined || arch === undefined) {
    console.error(
      'Uso: node scripts/check-installer-size.mjs <directorio> <win32|darwin|linux> <x64|arm64>'
    );
    return 2;
  }
  if (!existsSync(directory)) {
    console.error(`No existe el directorio ${directory}`);
    return 2;
  }

  const found = installers(directory);
  if (found.length === 0) {
    console.error(`No hay ningún instalador en ${directory}`);
    return 1;
  }

  const enforced = platform === 'win32';
  const measured = found.map((installer) => ({
    ...installer,
    ...measure(installer, enforced),
  }));

  report(measured, platform, arch, enforced);

  const over = measured.filter((item) => item.over);
  for (const item of over)
    console.error(`${item.name} pesa ${item.size} y el presupuesto es ${BUDGET_MB}MB`);
  return over.length > 0 ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
