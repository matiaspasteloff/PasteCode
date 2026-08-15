import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

const DESKTOP_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps',
  'desktop'
);

/**
 * Lee la versión del package.json de la app sin aserciones de tipo: el
 * contenido de un archivo es `unknown` hasta que alguien lo verifique.
 */
function readDesktopVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(join(DESKTOP_ROOT, 'package.json'), 'utf8'));

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'version' in parsed &&
    typeof parsed.version === 'string'
  ) {
    return parsed.version;
  }

  throw new Error('apps/desktop/package.json no tiene un campo "version" de tipo string');
}

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

test('abre una ventana con el título de la app', async () => {
  const window = await app.firstWindow();

  await expect(window.locator('.app__name')).toHaveText('PasteCode');
  expect(await window.title()).toBe('PasteCode');
});

test('muestra la versión que devuelve el canal app:getVersion', async () => {
  const window = await app.firstWindow();

  // Recorre la cadena entera: renderer → preload → handler del main con
  // validación Zod → contrato. Si algún eslabón está mal, acá se ve.
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

test('el preload expone invoke y nada más', async () => {
  const window = await app.firstWindow();

  const apiKeys = await window.evaluate(() => {
    // El callback corre en el renderer, donde el tipo de `window.pastecode`
    // no está declarado: para este test el objeto es justamente lo que hay
    // que inspeccionar, no algo que se pueda dar por tipado.
    const api: unknown = Reflect.get(globalThis, 'pastecode');
    return typeof api === 'object' && api !== null ? Object.keys(api) : [];
  });

  expect(apiKeys).toEqual(['invoke']);
});
