import { defineConfig } from '@playwright/test';

/**
 * Configuración aparte para los presupuestos de performance.
 *
 * Está separada de la suite E2E por tres razones concretas:
 *
 * - **El tope de 30 tests de [testing.md](../docs/convenciones/testing.md#reglas-de-testing)
 *   es de los E2E funcionales.** Estos no verifican comportamiento, verifican
 *   números, y contarlos ahí obligaría a sacar cobertura funcional para poder
 *   medir.
 * - **Los tiempos no se parecen.** Un E2E tiene 30 segundos de techo; medir
 *   veinte arranques tarda minutos por definición.
 * - **Corren en otro momento.** La suite funcional bloquea el merge en cada
 *   PR; los presupuestos son un job aparte que puede tardar.
 */
export default defineConfig({
  testDir: './perf',
  testMatch: '**/*.perf.ts',
  // Veinte arranques de Electron, más el warmup, no entran en 30 segundos.
  timeout: 10 * 60 * 1000,
  // Medir dos cosas a la vez es medir cómo se estorban entre ellas.
  workers: 1,
  fullyParallel: false,
  // Un presupuesto que se reintenta hasta que pasa no es un presupuesto.
  retries: 0,
  reporter: 'list',
});
