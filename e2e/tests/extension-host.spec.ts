import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { DESKTOP_ROOT, makeTempDirectory, PACKAGED_APP } from './support/desktop.js';

/** El techo de RF-907: el host tiene que volver en menos de dos segundos. */
const RESTART_BUDGET_MS = 2000;

let app: ElectronApplication;

test.beforeEach(async () => {
  app = await electron.launch({ args: [DESKTOP_ROOT] });
});

test.afterEach(async () => {
  await app.close();
});

/**
 * El estado del host, preguntado por el mismo canal que usaría la UI.
 *
 * Se manda como expresión en string y no como función tipada por lo mismo que
 * en `terminal.spec.ts`: del otro lado del `evaluate` no hay tipos que
 * sostengan a `window.pastecode`, y declararlos acá sería declarar el preload
 * por segunda vez. Lo que vuelve es `unknown` y se estrecha con una
 * comprobación de verdad, que es la regla 2 de codigo.md.
 */
async function hostStatus(window: Page): Promise<{ state: string; pid: number | null }> {
  const reported: unknown = await window.evaluate(
    `window.pastecode.invoke('extensions:getStatus', {}).then((r) => (r.ok ? r.value : null))`
  );

  if (typeof reported !== 'object' || reported === null) {
    throw new Error('extensions:getStatus no devolvió un estado');
  }

  const state: unknown = Reflect.get(reported, 'state');
  const pid: unknown = Reflect.get(reported, 'pid');

  if (typeof state !== 'string') throw new Error('El estado del host no tiene `state`');
  if (pid !== null && typeof pid !== 'number')
    throw new Error('El `pid` del host no es un número');

  return { state, pid };
}

/** Espera a que el host esté listo y devuelve su pid. */
async function waitForReadyPid(window: Page, timeout: number): Promise<number> {
  await expect.poll(async () => (await hostStatus(window)).state, { timeout }).toBe('ready');

  const { pid } = await hostStatus(window);

  if (pid === null) throw new Error('El host dice estar listo y no tiene pid');

  return pid;
}

/** Una extensión, tal como la reporta `extensions:list`. */
interface ListedExtension {
  name: string;
  state: string;
  reason?: string;
}

/** Lo que hay cargado, por el mismo canal que usaría la UI. */
async function listExtensions(window: Page): Promise<ListedExtension[]> {
  const reported: unknown = await window.evaluate(
    `window.pastecode.invoke('extensions:list', {}).then((r) => (r.ok ? r.value.extensions : []))`
  );

  if (!Array.isArray(reported)) return [];

  return reported.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];

    const name: unknown = Reflect.get(entry, 'name');
    const state: unknown = Reflect.get(entry, 'state');
    const reason: unknown = Reflect.get(entry, 'reason');

    if (typeof name !== 'string' || typeof state !== 'string') return [];

    return [{ name, state, ...(typeof reason === 'string' ? { reason } : {}) }];
  });
}

/**
 * RF-907 y RNF-09: el host crashea, vuelve solo, y el IDE no se entera.
 *
 * Es el test que define la etapa. Lo que verifica no es que el supervisor
 * funcione —eso ya lo cubren los unitarios de `supervised-process`— sino que el
 * host esté **enchufado** a él: que un proceso muerto de verdad, matado desde
 * afuera, produzca un proceso nuevo y no una app rota.
 *
 * Se mata por pid desde el proceso de test en vez de agregarle a la app un
 * canal para suicidarse. Un `debug:crashHost` sería código de producción que
 * existe sólo para este test, y además probaría un camino que ninguna extensión
 * va a recorrer: lo que hay que simular es un `process.exit(1)` ajeno, y matar
 * el proceso desde afuera es exactamente eso.
 */
test('el extension host se reinicia solo cuando crashea, y el IDE sigue vivo', async () => {
  const window = await app.firstWindow();

  // El arranque tiene más margen que el reinicio: incluye levantar la app
  // entera. Los dos segundos de RF-907 se miden sobre el reinicio, que es lo
  // que el requerimiento acota.
  const original = await waitForReadyPid(window, 30_000);

  expect(original).toBeGreaterThan(0);

  // El crash, visto desde afuera: un proceso que se va sin avisar.
  process.kill(original, 'SIGKILL');

  await expect
    .poll(async () => (await hostStatus(window)).pid, { timeout: RESTART_BUDGET_MS })
    .not.toBe(original);

  const restarted = await waitForReadyPid(window, RESTART_BUDGET_MS);

  expect(restarted).not.toBe(original);

  // La otra mitad del requerimiento, y la que importa: la app sigue andando.
  // Un host que se reinicia sobre un IDE que se colgó no cumple nada.
  await expect(window.locator('.app__name')).toHaveText('PasteCode');
});

/**
 * ADR-0027, contra el build de verdad: el host arranca desde adentro del asar.
 *
 * Es lo que verificaba el spike S1 escribiendo un archivo, ahora preguntado por
 * el canal de estado que el host ya tiene. Sigue haciendo falta y sigue teniendo
 * que correr **empaquetado**: en desarrollo el bundle del host es un archivo
 * suelto y cualquier cosa lo resuelve; adentro del asar no hay archivo, hay un
 * offset en un contenedor, y sólo las APIs de Electron parcheadas para
 * entenderlo pueden leerlo.
 *
 * Se saltea si no hay build empaquetado en vez de fallar: `pnpm test:e2e` corre
 * sobre `out/` y no tiene por qué exigir dos minutos de `pnpm package` antes.
 */
test('el extension host arranca desde adentro del asar', async () => {
  test.skip(PACKAGED_APP === undefined, 'No hay build empaquetado; corré `pnpm package`.');

  await app.close();
  app = await electron.launch({ executablePath: PACKAGED_APP ?? '' });

  const window = await app.firstWindow();

  // Que llegue a `ready` prueba las dos mitades: que el módulo se resolvió
  // desde adentro del asar, y que del otro lado hay un Node capaz de contestar.
  expect(await waitForReadyPid(window, 30_000)).toBeGreaterThan(0);
});

/**
 * RF-901 y RF-902: se cargan las del usuario, y una rota no tumba a las demás.
 *
 * El directorio de extensiones del usuario se apunta a un temporal con
 * `PASTECODE_E2E_HOME`, por lo mismo que en los tests de settings y de sesión:
 * una suite que le instala extensiones en el `~/.pastecode/` de quien la corre
 * es peor que no tener suite.
 */
test('carga las extensiones del usuario y reporta las rotas sin caerse', async () => {
  await app.close();

  const home = await makeTempDirectory('pastecode-ext-home-');
  const extensions = join(home, 'extensions');

  // Una sana sin `main`: es la forma de un tema, que contribuye sin ejecutar
  // código, así que queda `inactive` y eso es lo correcto.
  await mkdir(join(extensions, 'sana'), { recursive: true });
  await writeFile(
    join(extensions, 'sana', 'package.json'),
    JSON.stringify({
      name: 'sana',
      displayName: 'La Sana',
      version: '1.0.0',
      publisher: 'test',
      engines: { pastecode: '^1.0.0' },
      activationEvents: [],
      capabilities: [],
    }),
    'utf8'
  );

  // Una con el manifest incompleto: no carga, y tiene que verse.
  await mkdir(join(extensions, 'rota'), { recursive: true });
  await writeFile(
    join(extensions, 'rota', 'package.json'),
    JSON.stringify({ name: 'rota' }),
    'utf8'
  );

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_HOME: home },
  });

  const window = await app.firstWindow();

  await waitForReadyPid(window, 30_000);

  await expect
    .poll(async () => (await listExtensions(window)).length, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);

  const listed = await listExtensions(window);
  const sana = listed.find((entry) => entry.name === 'sana');
  const rota = listed.find((entry) => entry.reason !== undefined);

  expect(sana?.state).toBe('inactive');
  expect(rota?.state).toBe('failed');

  // La mitad que importa de RF-902: el IDE sigue andando.
  await expect(window.locator('.app__name')).toHaveText('PasteCode');

  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
