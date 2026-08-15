import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sólo la lógica pura del main. Lo que necesita un Electron vivo
    // —creación de ventanas, ciclo de vida— se verifica en el E2E, que lo
    // ejerce de verdad en vez de contra un mock.
    include: ['src/main/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/main/security/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
