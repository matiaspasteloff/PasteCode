import { describe, expect, it } from 'vitest';

import {
  flattenVisibleNodes,
  sortEntries,
  type DirectoryEntry,
  type FileTreeNode,
} from './tree.js';

/** Atajo para no repetir la ruta absoluta en cada caso. */
function entry(name: string, isDirectory = false): DirectoryEntry {
  return { name, path: `C:\\p\\${name}`, isDirectory };
}

function folder(name: string, children?: readonly FileTreeNode[]): FileTreeNode {
  return children === undefined ? { ...entry(name, true) } : { ...entry(name, true), children };
}

describe('sortEntries', () => {
  it('pone las carpetas antes que los archivos', () => {
    const sorted = sortEntries([entry('a.ts'), entry('zeta', true)]);

    expect(sorted.map((item) => item.name)).toEqual(['zeta', 'a.ts']);
  });

  it('ordena alfabéticamente dentro de cada grupo', () => {
    const sorted = sortEntries([
      entry('b.ts'),
      entry('src', true),
      entry('a.ts'),
      entry('docs', true),
    ]);

    expect(sorted.map((item) => item.name)).toEqual(['docs', 'src', 'a.ts', 'b.ts']);
  });

  it('usa orden natural para los números', () => {
    // Sin esto, `archivo10` va antes que `archivo2` y el árbol se lee mal.
    const sorted = sortEntries([entry('archivo10.ts'), entry('archivo2.ts')]);

    expect(sorted.map((item) => item.name)).toEqual(['archivo2.ts', 'archivo10.ts']);
  });

  it('ordena de forma determinista los nombres que sólo difieren en mayúsculas', () => {
    // No se fija *cuál* va primero —eso lo decide ICU y no es una decisión del
    // proyecto—, sino que la respuesta no dependa del orden de entrada. Un
    // árbol que se reordena solo al recargar es un bug muy molesto de rastrear.
    const names = [entry('README.md'), entry('readme.md'), entry('Readme.md')];

    const ascending = sortEntries(names).map((item) => item.name);
    const descending = sortEntries([...names].reverse()).map((item) => item.name);

    expect(ascending).toEqual(descending);
  });

  it('no toca el array que recibe', () => {
    const original = [entry('b.ts'), entry('a.ts')];

    sortEntries(original);

    expect(original.map((item) => item.name)).toEqual(['b.ts', 'a.ts']);
  });

  it('acepta una lista vacía', () => {
    expect(sortEntries([])).toEqual([]);
  });
});

describe('flattenVisibleNodes', () => {
  const file = (name: string): FileTreeNode => ({ ...entry(name) });

  it('devuelve los nodos de primer nivel con profundidad 0', () => {
    const visible = flattenVisibleNodes(
      [folder('src', [file('a.ts')]), file('b.ts')],
      new Set()
    );

    expect(visible.map((item) => [item.node.name, item.depth])).toEqual([
      ['src', 0],
      ['b.ts', 0],
    ]);
  });

  it('incluye los hijos de una carpeta desplegada, con profundidad mayor', () => {
    const tree = [folder('src', [file('a.ts')]), file('b.ts')];

    const visible = flattenVisibleNodes(tree, new Set(['C:\\p\\src']));

    expect(visible.map((item) => [item.node.name, item.depth])).toEqual([
      ['src', 0],
      ['a.ts', 1],
      ['b.ts', 0],
    ]);
  });

  it('marca isExpanded sólo en las carpetas desplegadas', () => {
    const tree = [folder('src', [file('a.ts')]), folder('docs', [])];

    const visible = flattenVisibleNodes(tree, new Set(['C:\\p\\src']));

    expect(visible.map((item) => [item.node.name, item.isExpanded])).toEqual([
      ['src', true],
      ['a.ts', false],
      ['docs', false],
    ]);
  });

  it('no aporta filas si la carpeta está desplegada pero los hijos no llegaron', () => {
    // `children: undefined` es "todavía no se pidieron", y pedirlos es I/O que
    // acá no puede pasar. La UI dispara la carga al expandir.
    const visible = flattenVisibleNodes([folder('src')], new Set(['C:\\p\\src']));

    expect(visible).toHaveLength(1);
    expect(visible[0]?.isExpanded).toBe(true);
  });

  it('distingue una carpeta vacía de una sin cargar', () => {
    const visible = flattenVisibleNodes([folder('vacia', [])], new Set(['C:\\p\\vacia']));

    expect(visible).toHaveLength(1);
  });

  it('anida varios niveles', () => {
    const tree = [folder('a', [folder('b', [file('c.ts')])])];
    const expanded = new Set(['C:\\p\\a', 'C:\\p\\b']);

    const visible = flattenVisibleNodes(tree, expanded);

    expect(visible.map((item) => [item.node.name, item.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c.ts', 2],
    ]);
  });

  it('no despliega los nietos si el padre está colapsado', () => {
    const tree = [folder('a', [folder('b', [file('c.ts')])])];

    // 'b' está en el set, pero no se lo ve porque 'a' no lo está.
    const visible = flattenVisibleNodes(tree, new Set(['C:\\p\\b']));

    expect(visible.map((item) => item.node.name)).toEqual(['a']);
  });

  it('ignora un archivo que aparezca en el set de desplegados', () => {
    const visible = flattenVisibleNodes([file('a.ts')], new Set(['C:\\p\\a.ts']));

    expect(visible[0]?.isExpanded).toBe(false);
  });

  it('acepta un árbol vacío', () => {
    expect(flattenVisibleNodes([], new Set())).toEqual([]);
  });
});
