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
      // El mismo umbral que packages/core: es lógica pura y se testea igual.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
