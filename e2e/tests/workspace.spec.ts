import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

let app: ElectronApplication;
let workspace: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-e2e-'));
  await writeFile(join(workspace, 'index.ts'), 'const saludo = "hola";\n', 'utf8');
  await mkdir(join(workspace, 'src'));
  await writeFile(join(workspace, 'src', 'anidado.ts'), 'export {};\n', 'utf8');
  // Tiene que quedar fuera del árbol: es la exclusión por defecto que hace
  // posible el dogfooding sobre este mismo repositorio.
  await mkdir(join(workspace, 'node_modules'));

  // Playwright no puede manejar un diálogo nativo del sistema operativo, así
  // que el main acepta esta variable en lugar de abrirlo. Sólo funciona con
  // `app.isPackaged === false`, y el E2E lanza la app sin empaquetar.
  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
});

test('abre una carpeta y muestra su nombre', async () => {
  const window = await app.firstWindow();

  await expect(window.getByTestId('workspace-name')).toHaveText(
    'No hay ninguna carpeta abierta'
  );

  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  // El nombre sale del último segmento de la ruta, derivado en el main: el
  // renderer no puede usar `basename` porque no tiene acceso a `node:path`.
  await expect(window.getByTestId('workspace-name')).toHaveText(
    workspace.split(/[\\/]/).at(-1) ?? ''
  );
});

test('conserva el workspace abierto al recargar la ventana', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await expect(window.getByTestId('workspace-name')).not.toHaveText(
    'No hay ninguna carpeta abierta'
  );

  await window.reload();

  // El workspace vive en el main, así que recargar el renderer no lo pierde.
  // Es lo que hace que `workspace:getRoot` valga la pena como canal.
  await expect(window.getByTestId('workspace-name')).toHaveText(
    workspace.split(/[\\/]/).at(-1) ?? ''
  );
});

test('despliega una carpeta y muestra lo que hay adentro', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();

  await window.getByRole('treeitem', { name: 'src' }).click();

  // El listado es perezoso: los hijos se piden recién al expandir.
  await expect(window.getByRole('treeitem', { name: 'anidado.ts' })).toBeVisible();
});
