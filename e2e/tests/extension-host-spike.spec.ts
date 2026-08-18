import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { PACKAGED_APP } from './support/desktop.js';

/**
 * S1: ¿`utilityProcess.fork()` resuelve un módulo de adentro del `.asar`?
 *
 * **Corre contra el `.exe` empaquetado**, no contra `out/`, y ésa es toda la
 * pregunta: en desarrollo el bundle del host es un archivo suelto en el disco y
 * cualquier cosa lo resuelve. Adentro del asar no hay archivo, hay un offset en
 * un contenedor, y sólo las APIs de Electron parcheadas para entenderlo pueden
 * leerlo. Es el mismo tipo de riesgo que el paso 14 de la Etapa 2 con los web
 * workers de Monaco bajo `file://`, y se cierra igual: midiendo, no razonando.
 *
 * El test se saltea si no hay build empaquetado, en vez de fallar: `pnpm
 * test:e2e` corre sobre `out/` y no tiene por qué exigir un `pnpm package` de
 * dos minutos antes de cada corrida.
 */
/** Un campo numérico del reporte. Lanza si no está: sería un bug del spike. */
function numberField(source: unknown, name: string): number {
  if (typeof source !== 'object' || source === null || !(name in source)) {
    throw new Error(`El reporte del host no tiene "${name}"`);
  }

  const value: unknown = Reflect.get(source, name);

  if (typeof value !== 'number') throw new Error(`"${name}" no es un número`);

  return value;
}

test('S1: el extension host se forkea desde adentro del asar', async () => {
  test.skip(PACKAGED_APP === undefined, 'No hay build empaquetado; corré `pnpm package`.');

  const home = await mkdtemp(join(tmpdir(), 'pastecode-s1-'));
  const report = join(home, 'extension-host-handshake.json');

  const app = await electron.launch({
    executablePath: PACKAGED_APP ?? '',
    env: { ...process.env, PASTECODE_SPIKE_REPORT: report },
  });

  try {
    // El main deja el resultado del handshake en un archivo. Que diga `ready`
    // prueba las dos mitades: que el módulo se resolvió desde adentro del asar,
    // y que del otro lado hay un proceso Node capaz de contestar.
    await expect
      .poll(async () => readFile(report, 'utf8').catch(() => ''), { timeout: 30_000 })
      .toContain('"event":"ready"');

    const outcome: unknown = JSON.parse(await readFile(report, 'utf8'));

    expect(outcome).toMatchObject({ event: 'ready' });

    // El pid del host **no** es el del main: si fueran iguales, el aislamiento
    // de ADR-0003 sería una carpeta y nada más. Se leen con narrowing y no con
    // una aserción: el contenido de un archivo es `unknown` hasta que alguien
    // lo verifique, que es la regla 2 de codigo.md.
    expect(numberField(outcome, 'pid')).toBeGreaterThan(0);
    expect(numberField(outcome, 'pid')).not.toBe(numberField(outcome, 'mainPid'));
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});
