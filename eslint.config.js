import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

/**
 * Módulos de Node con I/O. `packages/core` no puede importarlos: la regla de
 * dependencias de docs/02-arquitectura.md exige que corra en un test de Vitest
 * sin un solo mock, y eso deja de ser cierto en cuanto toca el disco.
 */
const NODE_IO_MODULES = [
  'fs',
  'node:fs',
  'node:fs/promises',
  'child_process',
  'node:child_process',
  'net',
  'node:net',
  'http',
  'node:http',
  'https',
  'node:https',
  'worker_threads',
  'node:worker_threads',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    rules: {
      // --- Límites de tamaño: RNF-20 -------------------------------------
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      complexity: ['error', 10],

      // --- Prohibiciones de convenciones/codigo.md -----------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-definitions': 'off',

      // Regla 5: nada de enums de TypeScript.
      // Regla 2: nada de aserciones de tipo, salvo `as const`. El escape es un
      // eslint-disable con la justificación al lado, que es lo que la
      // convención pide y lo que deja el rastro en el diff.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Prohibidos los enums (codigo.md, regla 5). Usá una unión de literales o un const object.',
        },
        {
          selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
          message:
            'Prohibidas las aserciones de tipo (codigo.md, regla 2), salvo en los límites del sistema. Si este es uno, dejá el eslint-disable con la justificación.',
        },
      ],

      // --- Dependencias circulares: reemplaza a madge (ADR-0010) ---------
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
      'import-x/no-self-import': 'error',

      // El orden de imports lo discute nadie: lo arregla la herramienta.
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Prohibido el catch vacío (codigo.md). El `catch {}` justificado lleva
      // su eslint-disable, igual que las aserciones.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // --- La regla de dependencias, como error de lint ---------------------
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message:
                'packages/core no puede importar Electron (02-arquitectura.md). Si necesitás algo del main, va por el ipc-contract.',
            },
            {
              name: 'react',
              message: 'packages/core no puede importar React: es lógica pura, no UI.',
            },
            ...NODE_IO_MODULES.map((name) => ({
              name,
              message: `packages/core no puede hacer I/O (${name}). Tiene que correr en un test sin mocks.`,
            })),
          ],
        },
      ],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/main/**', '**/preload/**', 'electron'],
              message:
                'El renderer no importa del main ni del preload, ni Electron directo (02-arquitectura.md). Si te falta algo, agregalo a @pastecode/ipc-contract.',
            },
            ...NODE_IO_MODULES.map((name) => ({
              group: [name],
              message:
                'El renderer no tiene acceso al SO. Toda operación privilegiada va por IPC hacia el main.',
            })),
          ],
        },
      ],
    },
  },

  // --- Excepciones acotadas --------------------------------------------
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      // Un archivo de tests con muchos casos es legible; uno partido a la
      // mitad para cumplir un límite pensado para código de producción, no.
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    // Archivos de configuración y scripts de build: fuera del grafo de tipos
    // del proyecto, así que las reglas type-aware no tienen de dónde agarrarse.
    files: [
      '**/*.config.{ts,js}',
      '**/*.config.*.{ts,js}',
      'eslint.config.js',
      '**/scripts/**/*.mjs',
    ],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Va aparte y no dentro del objeto de arriba: `languageOptions` no se
    // fusiona con el spread, lo reemplaza, y reemplazarlo borra el
    // `projectService: false` que trae disableTypeChecked.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      // Sin tipos, `no-undef` vuelve a ser útil, pero necesita saber qué
      // globals existen. Son scripts de Node.
      globals: { process: 'readonly', console: 'readonly' },
    },
  },

  prettier
);
