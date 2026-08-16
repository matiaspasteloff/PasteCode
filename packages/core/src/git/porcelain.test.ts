import { describe, expect, it } from 'vitest';

import { parseBranchList, parsePorcelainV2, parseToplevel } from './porcelain.js';

/** Arma una salida `-z`: cada registro termina en NUL. */
function output(...records: string[]): string {
  return records.map((record) => `${record}\0`).join('');
}

describe('parsePorcelainV2 — cabecera', () => {
  it('lee el nombre de la rama', () => {
    expect(parsePorcelainV2(output('# branch.head main')).branch.name).toBe('main');
  });

  it('trata el HEAD suelto como sin rama', () => {
    expect(parsePorcelainV2(output('# branch.head (detached)')).branch.name).toBeNull();
  });

  it('lee el upstream', () => {
    const status = parsePorcelainV2(output('# branch.upstream origin/main'));

    expect(status.branch.upstream).toBe('origin/main');
  });

  it('lee el ahead/behind, que viene gratis con --branch', () => {
    const status = parsePorcelainV2(output('# branch.ab +3 -2'));

    expect(status.branch).toMatchObject({ ahead: 3, behind: 2 });
  });

  it('deja el ahead/behind en cero si el campo no tiene la forma esperada', () => {
    const status = parsePorcelainV2(output('# branch.ab basura'));

    expect(status.branch).toMatchObject({ ahead: 0, behind: 0 });
  });

  it('ignora cabeceras que no le interesan', () => {
    expect(parsePorcelainV2(output('# branch.oid abc123')).changes).toEqual([]);
  });
});

describe('parsePorcelainV2 — archivos', () => {
  it('lee un archivo modificado sin preparar', () => {
    const status = parsePorcelainV2(output('1 .M N... 100644 100644 100644 abc def src/a.ts'));

    expect(status.changes).toEqual([
      { path: 'src/a.ts', indexStatus: null, worktreeStatus: 'modified', originalPath: null },
    ]);
  });

  it('lee un archivo preparado y vuelto a modificar', () => {
    const status = parsePorcelainV2(output('1 MM N... 100644 100644 100644 abc def src/a.ts'));

    expect(status.changes[0]).toMatchObject({
      indexStatus: 'modified',
      worktreeStatus: 'modified',
    });
  });

  it('lee un agregado y un borrado', () => {
    const status = parsePorcelainV2(
      output(
        '1 A. N... 000000 100644 100644 abc def nuevo.ts',
        '1 .D N... 100644 100644 000000 abc def viejo.ts'
      )
    );

    expect(status.changes.map((change) => change.indexStatus)).toEqual(['added', null]);
    expect(status.changes.map((change) => change.worktreeStatus)).toEqual([null, 'deleted']);
  });

  it('lee un archivo sin seguimiento', () => {
    const status = parsePorcelainV2(output('? nuevo.txt'));

    expect(status.changes[0]).toEqual({
      path: 'nuevo.txt',
      indexStatus: null,
      worktreeStatus: 'untracked',
      originalPath: null,
    });
  });

  it('descarta los ignorados', () => {
    expect(parsePorcelainV2(output('! node_modules/')).changes).toEqual([]);
  });

  it('marca los dos lados de un conflicto', () => {
    const status = parsePorcelainV2(
      output('u UU N... 100644 100644 100644 100644 a b c src/a.ts')
    );

    expect(status.changes[0]).toMatchObject({
      path: 'src/a.ts',
      indexStatus: 'conflict',
      worktreeStatus: 'conflict',
    });
  });

  it('lee un renombrado con su ruta original, que ocupa dos registros', () => {
    const status = parsePorcelainV2(
      output('2 R. N... 100644 100644 100644 abc def R100 nuevo.ts', 'viejo.ts')
    );

    expect(status.changes).toEqual([
      {
        path: 'nuevo.ts',
        indexStatus: 'renamed',
        worktreeStatus: null,
        originalPath: 'viejo.ts',
      },
    ]);
  });

  it('no se desalinea con lo que viene después de un renombrado', () => {
    const status = parsePorcelainV2(
      output(
        '2 R. N... 100644 100644 100644 abc def R100 nuevo.ts',
        'viejo.ts',
        '1 .M N... 100644 100644 100644 abc def otro.ts'
      )
    );

    expect(status.changes.map((change) => change.path)).toEqual(['nuevo.ts', 'otro.ts']);
  });

  it('conserva las rutas con espacios y acentos, que es para lo que está -z', () => {
    const status = parsePorcelainV2(
      output('1 .M N... 100644 100644 100644 abc def src/mi ñoño/año 2026.ts')
    );

    expect(status.changes[0]?.path).toBe('src/mi ñoño/año 2026.ts');
  });

  it('devuelve el estado vacío para una salida vacía', () => {
    expect(parsePorcelainV2('')).toEqual({
      branch: { name: null, upstream: null, ahead: 0, behind: 0 },
      changes: [],
    });
  });
});

describe('parseToplevel', () => {
  it('saca el salto de línea final', () => {
    expect(parseToplevel('C:/proyecto\n')).toBe('C:/proyecto');
  });

  it('devuelve null si no había nada', () => {
    expect(parseToplevel('  \n')).toBeNull();
  });
});

describe('parseBranchList', () => {
  it('lista los nombres en orden', () => {
    expect(parseBranchList('main\nfeature/x\n')).toEqual(['main', 'feature/x']);
  });

  it('descarta las líneas vacías', () => {
    expect(parseBranchList('\nmain\n\n')).toEqual(['main']);
  });
});
