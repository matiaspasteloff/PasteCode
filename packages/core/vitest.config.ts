import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // El barrel no tiene lógica; contarlo sólo diluye el número.
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // El umbral de docs/convenciones/testing.md para packages/core.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
