import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // testing.md: ningún E2E por encima de 30s.
  timeout: 30_000,
  // Electron levanta una app de escritorio real: paralelizar dos instancias
  // compitiendo por la misma userData no aporta velocidad, aporta flakiness.
  workers: 1,
  fullyParallel: false,
  // testing.md, regla 3: cero tests flaky tolerados. Un test que pasa al
  // segundo intento no está pasando, está escondiendo algo.
  retries: 0,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] !== undefined ? 'github' : 'list',
});
