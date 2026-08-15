import type { DirectoryEntry } from '@pastecode/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFileTreeStore } from '../../stores/file-tree-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { FileTree } from './FileTree.js';

const ROOT = 'C:\\p';

function entry(name: string, isDirectory = false): DirectoryEntry {
  return { name, path: `${ROOT}\\${name}`, isDirectory };
}

/** Renderiza el árbol con las entradas ya cargadas en el store. */
async function renderTree(entries: DirectoryEntry[], onSelectFile = vi.fn()) {
  installFakeApi({ 'fs:readDirectory': { ok: true, value: { entries } } });
  await useFileTreeStore.getState().loadRoot(ROOT);

  render(<FileTree selectedPath={null} onSelectFile={onSelectFile} />);

  return onSelectFile;
}

beforeEach(() => {
  // El store es de módulo y no tiene provider: sin esto, un test hereda el
  // árbol del anterior. Es la consecuencia de ADR-0004 que hay que recordar.
  useFileTreeStore.getState().clear();
});

describe('FileTree', () => {
  it('muestra un ítem por entrada, con el rol de árbol', async () => {
    await renderTree([entry('src', true), entry('a.ts')]);

    expect(screen.getByRole('tree', { name: 'Archivos del workspace' })).toBeDefined();
    expect(screen.getAllByRole('treeitem').map((item) => item.textContent)).toEqual([
      '▸src',
      '·a.ts',
    ]);
  });

  it('muestra el estado vacío cuando la carpeta no tiene nada', async () => {
    await renderTree([]);

    expect(screen.getByText('La carpeta está vacía')).toBeDefined();
  });

  it('muestra el estado de carga mientras el primer nivel no llegó', () => {
    installFakeApi({ 'fs:readDirectory': { ok: true, value: { entries: [] } } });
    void useFileTreeStore.getState().loadRoot(ROOT);

    render(<FileTree selectedPath={null} onSelectFile={vi.fn()} />);

    expect(screen.getByText('Cargando archivos…')).toBeDefined();
  });

  it('avisa qué archivo se eligió al hacer click', async () => {
    const onSelectFile = await renderTree([entry('a.ts')]);

    await userEvent.click(screen.getByRole('treeitem', { name: /a\.ts/ }));

    expect(onSelectFile).toHaveBeenCalledWith(`${ROOT}\\a.ts`);
  });

  it('marca el archivo abierto', async () => {
    installFakeApi({ 'fs:readDirectory': { ok: true, value: { entries: [entry('a.ts')] } } });
    await useFileTreeStore.getState().loadRoot(ROOT);

    render(<FileTree selectedPath={`${ROOT}\\a.ts`} onSelectFile={vi.fn()} />);

    expect(screen.getByRole('treeitem', { name: /a\.ts/ }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('despliega una carpeta al hacer click y muestra sus hijos', async () => {
    const invoke = installFakeApi({
      'fs:readDirectory': { ok: true, value: { entries: [entry('src', true)] } },
    });
    await useFileTreeStore.getState().loadRoot(ROOT);
    render(<FileTree selectedPath={null} onSelectFile={vi.fn()} />);

    invoke.mockResolvedValueOnce({
      ok: true,
      value: {
        entries: [{ name: 'hijo.ts', path: `${ROOT}\\src\\hijo.ts`, isDirectory: false }],
      },
    });
    await userEvent.click(screen.getByRole('treeitem', { name: /src/ }));

    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: /hijo\.ts/ })).toBeDefined();
    });
    expect(screen.getByRole('treeitem', { name: /src/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
  });

  it('no le pone aria-expanded a los archivos', async () => {
    // Decirle a un lector de pantalla que un archivo se puede desplegar es
    // decirle algo falso, y RNF-23 pide que los roles sean correctos.
    await renderTree([entry('a.ts')]);

    expect(screen.getByRole('treeitem', { name: /a\.ts/ }).hasAttribute('aria-expanded')).toBe(
      false
    );
  });

  it('declara la posición y el tamaño del nivel, que el DOM virtualizado no refleja', async () => {
    await renderTree([entry('a.ts'), entry('b.ts')]);

    const second = screen.getByRole('treeitem', { name: /b\.ts/ });

    expect(second.getAttribute('aria-posinset')).toBe('2');
    expect(second.getAttribute('aria-setsize')).toBe('2');
  });

  describe('navegación por teclado', () => {
    it('mueve el foco con las flechas', async () => {
      await renderTree([entry('a.ts'), entry('b.ts')]);
      const tree = screen.getByRole('tree');

      await userEvent.tab();
      await userEvent.keyboard('{ArrowDown}');

      expect(within(tree).getByRole('treeitem', { name: /b\.ts/ }).tabIndex).toBe(0);
    });

    it('abre el archivo enfocado con Enter', async () => {
      const onSelectFile = await renderTree([entry('a.ts')]);

      await userEvent.tab();
      await userEvent.keyboard('{Enter}');

      expect(onSelectFile).toHaveBeenCalledWith(`${ROOT}\\a.ts`);
    });

    it('deja que Tab saque el foco del árbol', async () => {
      // RNF-21: sin trampas de foco. Si el árbol se quedara con Tab, no habría
      // forma de salir de él sin el mouse.
      await renderTree([entry('a.ts')]);

      await userEvent.tab();
      expect(document.activeElement?.getAttribute('role')).toBe('treeitem');

      await userEvent.tab();
      expect(document.activeElement?.getAttribute('role')).not.toBe('treeitem');
    });
  });
});
