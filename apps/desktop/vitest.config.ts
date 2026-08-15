import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // La lógica del main, incluidos los servicios que tocan el disco de
    // verdad contra un `mkdtemp`. Lo que necesita un Electron vivo —creación
    // de ventanas, ciclo de vida, diálogos nativos— se verifica en el E2E,
    // que lo ejerce en serio en vez de contra un mock.
    include: ['src/main/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Antes esto era sólo `src/main/security/**` y sin thresholds, o sea que
      // el CI reportaba una cobertura verde sin medir nada de lo que se iba
      // agregando. Con `src/main/**` el número vuelve a significar algo.
      include: ['src/main/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        // Arranque y creación de ventanas: es Electron vivo, lo cubre el E2E.
        'src/main/index.ts',
        'src/main/environment.ts',
        'src/main/windows/**',
      ],
      // El umbral de docs/convenciones/testing.md para apps/desktop/src/main.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
