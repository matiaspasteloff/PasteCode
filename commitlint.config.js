/**
 * Conventional Commits, con los scopes de docs/convenciones/git.md.
 *
 * La lista de scopes es cerrada a propósito: un scope libre degenera en
 * `chore(varios)` y el historial deja de servir para reconstruir en qué parte
 * del sistema pasó cada cosa.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'editor',
        'terminal',
        'lsp',
        'dap',
        'git',
        'fs',
        'ext-host',
        'ui',
        'core',
        'ipc',
        'build',
        'ci',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    'body-max-line-length': [0],
  },
};
