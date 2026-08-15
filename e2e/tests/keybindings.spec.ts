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

let app: ElectronApplication;
let workspace: string;

test.beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-keys-'));
  await writeFile(join(workspace, 'uno.ts'), 'const uno = 1;\n', 'utf8');

  app = await electron.launch({
    args: [DESKTOP_ROOT],
    env: { ...process.env, PASTECODE_E2E_WORKSPACE: workspace },
  });
});

test.afterEach(async () => {
  await app.close();
  await rm(workspace, { recursive: true, force: true });
});

/** Espera a que la ventana esté pintada y con el foco en el documento. */
async function readyWindow(): Promise<Page> {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();
  await window.locator('.status-bar').click();

  return window;
}

test('un atajo con when no dispara fuera de contexto', async () => {
  // RF-703. `ctrl+w` tiene `when: hasOpenTab`, así que sin pestañas abiertas
  // no tiene que hacer nada — y sobre todo no tiene que romper.
  const window = await readyWindow();

  await window.keyboard.press('Control+W');

  await expect(window.getByRole('tab')).toHaveCount(0);
  await expect(window.getByRole('button', { name: 'Abrir carpeta' })).toBeVisible();
});

test('el mismo atajo sí dispara cuando el contexto se cumple', async () => {
  const window = await readyWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).click();
  await window.getByRole('treeitem', { name: 'uno.ts' }).click();
  await expect(window.getByRole('tab')).toHaveCount(1);

  await window.keyboard.press('Control+W');

  await expect(window.getByRole('tab')).toHaveCount(0);
});
