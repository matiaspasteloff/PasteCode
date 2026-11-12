import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT, readDesktopVersion } from './support/desktop.js';

let app: ElectronApplication;

test.beforeEach(async () => {
  // Sin ELECTRON_RENDERER_URL: la app arranca contra el build de producción,
  // así que lo que se verifica acá es la política de seguridad estricta y no
  // la relajada de desarrollo.
  app = await electron.launch({ args: [DESKTOP_ROOT] });
});

test.afterEach(async () => {
  await app.close();
});

test('abre una ventana con el título y la versión de la app', async () => {
  const window = await app.firstWindow();

  await expect(window.locator('.app__name')).toHaveText('PasteCode');
  expect(await window.title()).toBe('PasteCode');

  // La versión recorre la cadena entera: renderer → preload → handler del main
  // con validación Zod → contrato. Si algún eslabón está mal, acá se ve. Iba en
  // un test aparte hasta que la terminal llenó el presupuesto de 30 E2E de
  // testing.md; son dos aserciones sobre la misma ventana recién abierta, así
  // que fusionarlas no cuesta cobertura.
  await expect(window.getByTestId('app-version')).toHaveText(readDesktopVersion());
});

test('el renderer no tiene acceso a Node', async () => {
  const window = await app.firstWindow();

  // La prueba real de que nodeIntegration: false y sandbox: true están
  // activos. Es la clase de regresión que se cuela sin ruido al debuggear un
  // problema distinto, y que después nadie nota.
  const exposed = await window.evaluate(() => ({
    hasRequire: 'require' in globalThis,
    hasProcess: 'process' in globalThis,
    hasModule: 'module' in globalThis,
  }));

  expect(exposed).toEqual({ hasRequire: false, hasProcess: false, hasModule: false });
});

test('la CSP de producción bloquea scripts inline', async () => {
  const window = await app.firstWindow();

  // Verifica que la CSP llegue de verdad al renderer. Es la parte que no se
  // puede dar por sentada: el header lo emite `onHeadersReceived` en el main, y
  // acá la página se sirve por file://, donde no era obvio que el hook
  // aplicara. Sin esta prueba, la CSP podría no estar aplicándose y todo lo
  // demás pasaría igual.
  const result = await window.evaluate(
    async () =>
      new Promise<{ violations: string[]; inlineRan: boolean }>((resolve) => {
        const violations: string[] = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          violations.push(event.violatedDirective);
        });

        const script = document.createElement('script');
        script.textContent = 'globalThis.__inlineRan = true;';
        document.head.appendChild(script);

        setTimeout(() => {
          resolve({ violations, inlineRan: '__inlineRan' in globalThis });
        }, 300);
      })
  );

  expect(result.inlineRan).toBe(false);
  expect(result.violations).toContain('script-src-elem');
});

test('el preload expone platform, invoke y subscribe, y nada más', async () => {
  const window = await app.firstWindow();

  const surface = await window.evaluate((): { apiKeys: string[]; platform: string } => {
    // El callback corre en el renderer, donde el tipo de `window.pastecode`
    // no está declarado: para este test el objeto es justamente lo que hay
    // que inspeccionar, no algo que se pueda dar por tipado.
    const api: unknown = Reflect.get(globalThis, 'pastecode');
    if (typeof api !== 'object' || api === null) return { apiKeys: [], platform: '' };
    const platform: unknown = Reflect.get(api, 'platform');
    return { apiKeys: Object.keys(api), platform: String(platform) };
  });
  const { apiKeys, platform } = surface;

  // La lista es exacta a propósito: es la superficie entera que el renderer
  // puede tocar, y que crezca sin que nadie lo decida es justo lo que el
  // contextBridge existe para impedir. Ver ADR-0013. `platform` es un dato y no
  // una capacidad: el renderer lo necesita antes del primer render.
  expect(apiKeys).toEqual(['platform', 'invoke', 'subscribe']);
  // Que el preload sandboxeado de verdad vea `process.platform`, y que lo
  // reduzca a uno de los tres sistemas que la app conoce.
  expect(platform).toBe(
    process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux'
  );
});
