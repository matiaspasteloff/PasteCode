import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Dos proyectos porque hay dos entornos de verdad distintos, no por gusto: el
 * main corre en Node y toca el disco, el renderer corre en un DOM y no tiene
 * acceso a nada del sistema. Un solo proyecto obligaría a levantar jsdom para
 * los tests de filesystem —lento y sin sentido— o a testear componentes sin DOM.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          // Lo que necesita un Electron vivo —ventanas, ciclo de vida,
          // diálogos nativos— se verifica en el E2E, que lo ejerce en serio.
          include: ['src/main/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/main/**/*.ts', 'src/renderer/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        // Arranque y creación de ventanas: es Electron vivo, lo cubre el E2E.
        'src/main/index.ts',
        'src/main/environment.ts',
        'src/main/windows/**',
        // Punto de entrada del renderer: monta el root de React y nada más.
        'src/renderer/main.tsx',
      ],
      // Los umbrales de docs/convenciones/testing.md, por carpeta. Un único
      // umbral global dejaría que la cobertura alta del main tape un renderer
      // sin testear, que es exactamente lo que el número tiene que evitar.
      thresholds: {
        'src/main/**': { lines: 70, functions: 70, branches: 70, statements: 70 },
        'src/renderer/**': { lines: 50, functions: 50, branches: 50, statements: 50 },
      },
    },
  },
});
