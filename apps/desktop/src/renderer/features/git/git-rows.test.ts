import type { GitRepository } from '@pastecode/ipc-contract';
import { describe, expect, it } from 'vitest';

import { decorationsByPath, flattenGitRows, normalizePath } from './git-rows.js';

/** Un repositorio con los cambios que pida el test. */
function repository(changes: GitRepository['changes'], root = 'C:\\p'): GitRepository {
  return {
    root,
    branch: { name: 'main', upstream: null, ahead: 0, behind: 0 },
    changes,
  };
}

/** Un cambio con los dos estados que pida el test. */
function change(
  path: string,
  indexStatus: GitRepository['changes'][number]['indexStatus'],
  worktreeStatus: GitRepository['changes'][number]['worktreeStatus']
): GitRepository['changes'][number] {
  return { path, indexStatus, worktreeStatus, originalPath: null };
}

describe('flattenGitRows', () => {
  it('devuelve una lista vacía sin repositorio', () => {
    expect(flattenGitRows(null)).toEqual([]);
  });

  it('devuelve una lista vacía con un repositorio limpio', () => {
    expect(flattenGitRows(repository([]))).toEqual([]);
  });

  it('separa lo preparado de lo que no', () => {
    const rows = flattenGitRows(
      repository([change('a.ts', 'added', null), change('b.ts', null, 'modified')])
    );

    expect(rows.map((row) => row.kind)).toEqual(['section', 'file', 'section', 'file']);
  });

  it('pone un archivo en los dos grupos cuando está en los dos', () => {
    // `MM` es preparado y vuelto a modificar. Esconder una de las dos mitades
    // haría que preparar el archivo no cambie nada visible.
    const rows = flattenGitRows(repository([change('a.ts', 'modified', 'modified')]));

    expect(rows.filter((row) => row.kind === 'file')).toHaveLength(2);
  });

  it('no dibuja el encabezado de un grupo vacío', () => {
    const rows = flattenGitRows(repository([change('a.ts', null, 'modified')]));

    expect(rows.filter((row) => row.kind === 'section').map((row) => row.section)).toEqual([
      'changes',
    ]);
  });

  it('cuenta los archivos de cada grupo en su encabezado', () => {
    const rows = flattenGitRows(
      repository([change('a.ts', null, 'modified'), change('b.ts', null, 'untracked')])
    );
    const [header] = rows;

    expect(header?.kind === 'section' && header.count).toBe(2);
  });

  it('ordena los archivos por ruta', () => {
    const rows = flattenGitRows(
      repository([change('z.ts', null, 'modified'), change('a.ts', null, 'modified')])
    );

    expect(rows.filter((row) => row.kind === 'file').map((row) => row.path)).toEqual([
      'a.ts',
      'z.ts',
    ]);
  });
});

describe('decorationsByPath', () => {
  it('devuelve un mapa vacío sin repositorio', () => {
    expect(decorationsByPath(null).size).toBe(0);
  });

  it('traduce la ruta relativa de git a la absoluta del árbol', () => {
    const decorations = decorationsByPath(repository([change('src/a.ts', null, 'modified')]));

    expect(decorations.get('C:/p/src/a.ts')).toBe('modified');
  });

  it('marca las carpetas que contienen algo cambiado', () => {
    // Sin esto, un archivo cambiado adentro de una carpeta colapsada es
    // invisible, que es justo cuando la marca sirve.
    const decorations = decorationsByPath(
      repository([change('src/deep/a.ts', null, 'untracked')])
    );

    expect(decorations.get('C:/p/src')).toBe('modified');
    expect(decorations.get('C:/p/src/deep')).toBe('modified');
  });

  it('no marca la raíz del repositorio', () => {
    const decorations = decorationsByPath(repository([change('a.ts', null, 'modified')]));

    expect(decorations.has('C:/p')).toBe(false);
  });

  it('el estado del árbol de trabajo gana sobre el del índice', () => {
    // El árbol muestra lo que hay en el disco, no lo que hay en el índice.
    const decorations = decorationsByPath(repository([change('a.ts', 'added', 'deleted')]));

    expect(decorations.get('C:/p/a.ts')).toBe('deleted');
  });

  it('usa el del índice cuando el árbol está limpio', () => {
    const decorations = decorationsByPath(repository([change('a.ts', 'added', null)]));

    expect(decorations.get('C:/p/a.ts')).toBe('added');
  });
});

describe('normalizePath', () => {
  it('pasa las barras invertidas a barras', () => {
    expect(normalizePath('C:\\p\\src')).toBe('C:/p/src');
  });

  it('saca la barra final', () => {
    expect(normalizePath('/p/src/')).toBe('/p/src');
  });
});
