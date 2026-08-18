import type { VisibleNode } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import { treeRowsWithEdit } from './tree-rows.js';

const ROOT = '/proyecto';

/** Una fila visible del árbol. */
function visible(name: string, depth = 0, isDirectory = false, parent = ROOT): VisibleNode {
  return {
    node: { name, path: `${parent}/${name}`, isDirectory },
    depth,
    isExpanded: false,
    positionInLevel: 1,
    levelSize: 1,
  };
}

/** Los nombres de las filas, con `<campo>` donde está el input. */
function shape(rows: ReturnType<typeof treeRowsWithEdit>): string[] {
  return rows.map((row) => (row.kind === 'edit' ? '<campo>' : row.visible.node.name));
}

describe('treeRowsWithEdit', () => {
  it('devuelve las filas tal cual cuando no hay edición', () => {
    const rows = [visible('src', 0, true), visible('README.md')];

    expect(shape(treeRowsWithEdit(rows, null))).toEqual(['src', 'README.md']);
  });

  it('reemplaza la fila que se está renombrando', () => {
    // Reemplaza y no inserta: el nombre viejo no puede quedar a la vista
    // mientras se escribe el nuevo, o parecen dos entradas distintas.
    const rows = [visible('src', 0, true), visible('viejo.ts')];

    const result = treeRowsWithEdit(rows, {
      kind: 'rename',
      path: `${ROOT}/viejo.ts`,
      currentName: 'viejo.ts',
    });

    expect(shape(result)).toEqual(['src', '<campo>']);
  });

  it('arranca el campo de renombrar con el nombre actual', () => {
    const rows = [visible('viejo.ts')];

    const result = treeRowsWithEdit(rows, {
      kind: 'rename',
      path: `${ROOT}/viejo.ts`,
      currentName: 'viejo.ts',
    });

    expect(result[0]).toMatchObject({ kind: 'edit', initialName: 'viejo.ts' });
  });

  it('deja el árbol intacto si lo que se renombra dejó de estar visible', () => {
    // Pasa cuando el watcher refresca justo mientras el campo está abierto.
    const rows = [visible('src', 0, true)];

    const result = treeRowsWithEdit(rows, {
      kind: 'rename',
      path: `${ROOT}/fantasma.ts`,
      currentName: 'fantasma.ts',
    });

    expect(shape(result)).toEqual(['src']);
  });

  it('inserta el campo de creación adentro de su carpeta', () => {
    const rows = [visible('src', 0, true), visible('README.md')];

    const result = treeRowsWithEdit(rows, { kind: 'createFile', parentPath: `${ROOT}/src` });

    expect(shape(result)).toEqual(['src', '<campo>', 'README.md']);
  });

  it('sangra el campo un nivel más que su carpeta', () => {
    const rows = [visible('src', 2, true)];

    const result = treeRowsWithEdit(rows, { kind: 'createFile', parentPath: `${ROOT}/src` });

    expect(result[1]).toMatchObject({ kind: 'edit', depth: 3 });
  });

  it('pone el campo primero y al nivel cero cuando se crea en la raíz', () => {
    // La raíz del workspace no tiene fila propia —el árbol arranca en sus
    // hijos—, así que no hay carpeta a la que seguir.
    const rows = [visible('src', 0, true)];

    const result = treeRowsWithEdit(rows, { kind: 'createFile', parentPath: ROOT });

    expect(shape(result)).toEqual(['<campo>', 'src']);
    expect(result[0]).toMatchObject({ depth: 0 });
  });

  it('marca el campo como carpeta al crear una', () => {
    // Es lo que decide el ícono mientras se escribe el nombre.
    const result = treeRowsWithEdit([], { kind: 'createDirectory', parentPath: ROOT });

    expect(result[0]).toMatchObject({ kind: 'edit', isDirectory: true, initialName: '' });
  });

  it('deja el campo solo cuando el árbol está vacío', () => {
    // Crear el primer archivo de una carpeta vacía es un caso de verdad.
    const result = treeRowsWithEdit([], { kind: 'createFile', parentPath: ROOT });

    expect(shape(result)).toEqual(['<campo>']);
  });
});
