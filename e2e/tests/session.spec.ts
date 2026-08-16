import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { DESKTOP_ROOT } from './support/desktop.js';

let workspace: string;
let home: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-e2e-sesion-'));
  // Los archivos de sesión son de verdad. Sin este directorio aparte, el test
  // le pisaría el `~/.pastecode/` a quien corre la suite.
  home = await mkdtemp(join(tmpdir(), 'pastecode-e2e-home-'));

  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');
  await writeFile(join(workspace, 'dos.ts'), 'const dos = 2;\n', 'utf8');
  await writeFile(join(workspace, 'efimero.ts'), 'const efimero = 3;\n', 'utf8');
});

test.afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

/** Lanza la app apuntando al workspace y al directorio de datos del test. */
async function launch(): Promise<ElectronApplication> {
  return electron.launch({
    args: [DESKTOP_ROOT],
    env: {
      ...process.env,
      PASTECODE_E2E_WORKSPACE: workspace,
      PASTECODE_E2E_HOME: home,
    },
  });
}

/** Abre la carpeta y espera a que el árbol responda. */
async function openWorkspace(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await expect(window.getByRole('treeitem', { name: 'uno.ts' })).toBeVisible();

  return window;
}

test('reabre las mismas pestañas, y descarta la del archivo que ya no está', async () => {
  const first = await launch();
  const window = await openWorkspace(first);

  for (const name of ['uno.ts', 'dos.ts', 'efimero.ts']) {
    await window.getByRole('treeitem', { name }).click();
    await expect(window.locator('.monaco-editor')).toContainText(name.replace('.ts', ''));
  }

  await window.getByTestId('tab-dos.ts').click();
  await expect(window.getByRole('tab')).toHaveCount(3);

  // El guardado tiene un debounce de 2s, pero `before-quit` lo fuerza: es lo
  // que hace que lo último que alguien hizo antes de cerrar no se pierda.
  await first.close();

  // Entre una sesión y la otra pasó algo que borró un archivo, que es lo que
  // pasa de verdad con un `git checkout`.
  await rm(join(workspace, 'efimero.ts'));

  const second = await launch();
  const reopened = await openWorkspace(second);

  // RF-707: las mismas pestañas y la misma activa. La del archivo borrado se
  // descarta en silencio, sin ningún diálogo.
  await expect(reopened.getByRole('tab')).toHaveCount(2);
  await expect(reopened.getByTestId('tab-uno.ts')).toBeVisible();
  await expect(reopened.getByTestId('tab-dos.ts')).toBeVisible();
  await expect(reopened.getByTestId('tab-efimero.ts')).toBeHidden();
  await expect(reopened.getByRole('tab', { selected: true })).toHaveAttribute(
    'data-testid',
    'tab-dos.ts'
  );

  await second.close();
});
