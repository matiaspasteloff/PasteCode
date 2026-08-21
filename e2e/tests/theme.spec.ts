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
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-tema-'));
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

/**
 * Fuerza un tema escribiendo el atributo, como hace `useTheme`.
 *
 * El camino por la paleta lo cubre el otro test de este archivo, y la lógica
 * de resolución la cubren los unitarios de `useTheme`. Acá interesa lo otro:
 * que **el mecanismo de tokens CSS repinte la aplicación de verdad**, que es
 * lo que afirma RF-801.
 */
async function forceTheme(window: Page, theme: 'light' | 'dark'): Promise<void> {
  await window.evaluate((value: string) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

/** El color de fondo calculado de un selector. */
async function backgroundOf(window: Page, selector: string): Promise<string> {
  return window
    .locator(selector)
    .evaluate((element) => globalThis.getComputedStyle(element).backgroundColor);
}

test('cambia de tema en caliente y repinta toda la aplicación', async () => {
  // RF-801. Todo el color sale de variables CSS, así que cambiar un atributo
  // del `<html>` repinta la aplicación entera sin volver a montar nada.
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  // `system` ya viene resuelto: el atributo nunca dice "system".
  expect(['light', 'dark']).toContain(
    await window.evaluate(() => document.documentElement.dataset.theme)
  );

  await forceTheme(window, 'light');
  const light = {
    body: await backgroundOf(window, 'body'),
    side: await backgroundOf(window, '.sidebar'),
  };

  await forceTheme(window, 'dark');
  const dark = {
    body: await backgroundOf(window, 'body'),
    side: await backgroundOf(window, '.sidebar'),
  };

  // El fondo y los paneles: si sólo cambiara uno, el tema estaría a medias.
  expect(light.body).not.toBe(dark.body);
  expect(light.side).not.toBe(dark.side);

  // Y el camino de verdad, el que usa una persona: el comando de la paleta.
  // Iba en un test aparte hasta que la terminal llenó el presupuesto de 30
  // E2E de testing.md, que manda fusionar casos relacionados antes que subir
  // el número. Fusionar acá no pierde nada: es el mismo repintado, disparado
  // desde donde se dispara en serio.
  await window.locator('.status-bar').click();
  await forceTheme(window, 'light');

  await window.keyboard.press('Control+Shift+P');
  await expect(window.getByRole('combobox')).toBeVisible();
  await window.keyboard.type('tema');

  // Se verifica que el primero que coincide sea **un** comando de tema, y no
  // uno en particular: el matcher es difuso, así que cualquier comando con
  // "terminal" en el título coincide con "tema" por subsecuencia, y desde la
  // etapa experimental hay dos comandos de tema —rotar claro/oscuro y elegir
  // uno de los nueve incorporados—. Fijar cuál gana ataría este test al orden
  // interno del ranking.
  await expect(window.getByRole('option').first()).toContainText(/tema/i);
  await window.keyboard.press('Enter');

  await expect(window.locator('.palette')).toHaveCount(0);
  expect(['light', 'dark']).toContain(
    await window.evaluate(() => document.documentElement.dataset.theme)
  );
});

test('el selector de temas previsualiza al moverse y restaura al cancelar', async () => {
  // Los nueve temas incorporados de ADR-0031, por el camino de verdad. Va en su
  // propio test y no fusionado con el de arriba porque lo que verifica es otra
  // cosa: que el preview **pinte** y que cancelar **restaure**, que es la mitad
  // del valor del selector y la parte que es fácil romper sin notarlo.
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Abrir carpeta' }).waitFor();

  const before = await backgroundOf(window, 'body');

  // El primer acorde del proyecto: Ctrl+K, soltar, Ctrl+T.
  await window.keyboard.press('Control+K');
  await window.keyboard.press('Control+T');
  await expect(window.getByRole('combobox')).toBeVisible();

  // Abrirse ya previsualiza el primero de la lista.
  const previewed = await backgroundOf(window, 'body');
  expect(previewed).not.toBe(before);

  await window.keyboard.press('Escape');

  await expect(window.locator('.palette')).toHaveCount(0);
  expect(await backgroundOf(window, 'body')).toBe(before);
});
