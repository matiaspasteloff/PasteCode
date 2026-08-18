import type { FileTreeNode, VisibleNode } from '@pastecode/core';
import { flattenVisibleNodes } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import { resolveTreeKey } from './tree-keyboard.js';

function file(name: string): FileTreeNode {
  return { name, path: `C:\\p\\${name}`, isDirectory: false };
}

function folder(name: string, children?: readonly FileTreeNode[]): FileTreeNode {
  const base = { name, path: `C:\\p\\${name}`, isDirectory: true };

  return children === undefined ? base : { ...base, children };
}

/**
 * `src` desplegada con dos hijos, `vacia` desplegada sin hijos cargados,
 * `raiz.ts` suelto. Cubre los tres casos que las flechas tratan distinto.
 *
 * ```
 * src            0
 *   a.ts         1
 *   b.ts         2
 * vacia          3  (desplegada, sin hijos a la vista)
 * raiz.ts        4
 * ```
 */
function buildRows(): VisibleNode[] {
  const tree = [folder('src', [file('a.ts'), file('b.ts')]), folder('vacia'), file('raiz.ts')];

  return flattenVisibleNodes(tree, new Set(['C:\\p\\src', 'C:\\p\\vacia']));
}

const rows = buildRows();

describe('resolveTreeKey', () => {
  describe('movimiento simple', () => {
    it('baja con ArrowDown', () => {
      expect(resolveTreeKey('ArrowDown', rows, 0)).toEqual({ focusIndex: 1 });
    });

    it('no pasa de la última fila', () => {
      expect(resolveTreeKey('ArrowDown', rows, rows.length - 1)).toEqual({
        focusIndex: rows.length - 1,
      });
    });

    it('sube con ArrowUp', () => {
      expect(resolveTreeKey('ArrowUp', rows, 2)).toEqual({ focusIndex: 1 });
    });

    it('no pasa de la primera fila', () => {
      expect(resolveTreeKey('ArrowUp', rows, 0)).toEqual({ focusIndex: 0 });
    });

    it('va al principio con Home y al final con End', () => {
      expect(resolveTreeKey('Home', rows, 3)).toEqual({ focusIndex: 0 });
      expect(resolveTreeKey('End', rows, 0)).toEqual({ focusIndex: rows.length - 1 });
    });
  });

  describe('ArrowRight', () => {
    it('baja al primer hijo si la carpeta ya está desplegada', () => {
      expect(resolveTreeKey('ArrowRight', rows, 0)).toEqual({ focusIndex: 1 });
    });

    it('despliega la carpeta si está replegada', () => {
      const collapsed = flattenVisibleNodes([folder('src', [file('a.ts')])], new Set());

      expect(resolveTreeKey('ArrowRight', collapsed, 0)).toEqual({ activate: collapsed[0] });
    });

    it('no hace nada sobre un archivo', () => {
      expect(resolveTreeKey('ArrowRight', rows, 1)).toBeUndefined();
    });

    it('no hace nada sobre una carpeta desplegada cuyos hijos no llegaron', () => {
      // `vacia` está en el índice 3 y la fila siguiente es un hermano, no un
      // hijo. Bajar ahí sería salirse de la carpeta.
      expect(resolveTreeKey('ArrowRight', rows, 3)).toBeUndefined();
    });

    it('no hace nada sobre una carpeta desplegada que es la última fila', () => {
      const single = flattenVisibleNodes([folder('vacia')], new Set(['C:\\p\\vacia']));

      expect(resolveTreeKey('ArrowRight', single, 0)).toBeUndefined();
    });
  });

  describe('ArrowLeft', () => {
    it('repliega la carpeta si está desplegada', () => {
      expect(resolveTreeKey('ArrowLeft', rows, 0)).toEqual({ activate: rows[0] });
    });

    it('sube al padre desde un hijo', () => {
      expect(resolveTreeKey('ArrowLeft', rows, 2)).toEqual({ focusIndex: 0 });
    });

    it('no hace nada sobre un nodo de primer nivel que no es carpeta desplegada', () => {
      expect(resolveTreeKey('ArrowLeft', rows, 4)).toBeUndefined();
    });
  });

  describe('activación', () => {
    it.each(['Enter', ' '])('activa la fila enfocada con %s', (key) => {
      expect(resolveTreeKey(key, rows, 1)).toEqual({ activate: rows[1] });
    });
  });

  describe('edición (RF-003)', () => {
    it('abre el renombrar de la fila enfocada con F2', () => {
      expect(resolveTreeKey('F2', rows, 1)).toEqual({ rename: rows[1] });
    });

    it('pide eliminar la fila enfocada con Delete', () => {
      // Sólo **pide**: la confirmación es del diálogo, porque Delete está
      // pegada a las flechas con las que se navega el árbol.
      expect(resolveTreeKey('Delete', rows, 1)).toEqual({ remove: rows[1] });
    });

    it('no mueve el foco ni activa nada al renombrar', () => {
      const outcome = resolveTreeKey('F2', rows, 1);

      expect(outcome?.focusIndex).toBeUndefined();
      expect(outcome?.activate).toBeUndefined();
    });

    it.each(['F2', 'Delete'])('ignora %s sobre un árbol vacío', (key) => {
      expect(resolveTreeKey(key, [], 0)).toBeUndefined();
    });
  });

  describe('teclas ajenas', () => {
    it('ignora Tab, para no crear una trampa de foco', () => {
      // RNF-21: sin trampas de foco. Si el árbol se quedara con Tab, no habría
      // forma de salir de él con el teclado.
      expect(resolveTreeKey('Tab', rows, 0)).toBeUndefined();
    });

    it.each(['a', 'Escape', 'PageDown'])('ignora %s', (key) => {
      expect(resolveTreeKey(key, rows, 0)).toBeUndefined();
    });

    it('no hace nada si el índice enfocado no existe', () => {
      expect(resolveTreeKey('ArrowDown', [], 0)).toBeUndefined();
    });
  });
});
