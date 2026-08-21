import type { EditorGroup } from '@pastecode/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { selectActiveTabs, useEditorStore } from '../../stores/editor-store.js';
import { groupsWith, resetEditorStore } from '../../test-support/editor-state.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { ConflictDialog } from './ConflictDialog.js';
import { TabStrip } from './TabStrip.js';

const A = 'C:\\p\\saludo.ts';
const B = 'C:\\p\\otro.ts';
const CONFLICT = { code: 'STALE_FILE', userMessage: 'Cambió en el disco.' };

beforeEach(() => {
  resetEditorStore();
});

/** El grupo primario tal como está en el store ahora mismo. */
function primaryGroup(): EditorGroup {
  const [group] = useEditorStore.getState().groups.groups;

  if (group === undefined) throw new Error('El store siempre tiene un grupo');

  return group;
}

describe('TabStrip', () => {
  it('no muestra nada sin pestañas abiertas', () => {
    const { container } = render(<TabStrip group={primaryGroup()} />);

    expect(container.firstChild).toBeNull();
  });

  it('muestra una pestaña por archivo, con el nombre y sin la ruta', () => {
    useEditorStore.setState({ groups: groupsWith([A, B]) });

    render(<TabStrip group={primaryGroup()} />);

    // Sólo el nombre: desde el rediseño, el icono del archivo y la × de cerrar
    // son SVG y no texto, así que ya no ensucian el contenido de la pestaña.
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'saludo.ts',
      'otro.ts',
    ]);
  });

  it('marca cuál es la pestaña seleccionada', () => {
    useEditorStore.setState({ groups: groupsWith([A, B], 1) });

    render(<TabStrip group={primaryGroup()} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
    ]);
  });

  it('cambia de pestaña al hacer click', async () => {
    useEditorStore.setState({ groups: groupsWith([A, B], 0) });
    render(<TabStrip group={primaryGroup()} />);

    await userEvent.click(screen.getByTestId('tab-otro.ts'));

    expect(selectActiveTabs(useEditorStore.getState()).activeTabIndex).toBe(1);
  });

  it('muestra el punto de cambios sin guardar sólo en la pestaña sucia', () => {
    useEditorStore.setState({ groups: groupsWith([A, B], 1) });
    useEditorStore.getState().markDirty();

    render(<TabStrip group={primaryGroup()} />);

    expect(screen.getAllByTestId('tab-dirty-indicator')).toHaveLength(1);
  });

  it('cierra la pestaña sin activarla primero', async () => {
    // Sin `stopPropagation`, cerrar la pestaña de la derecha activaría esa
    // misma pestaña antes de cerrarla, y quedaría la activa equivocada.
    useEditorStore.setState({ groups: groupsWith([A, B], 0) });
    render(<TabStrip group={primaryGroup()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar otro.ts' }));

    expect(selectActiveTabs(useEditorStore.getState()).tabs.map((tab) => tab.path)).toEqual([
      A,
    ]);
    expect(selectActiveTabs(useEditorStore.getState()).activeTabIndex).toBe(0);
  });
});

describe('ConflictDialog', () => {
  it('mantiene el diálogo montado y cerrado mientras no hay conflicto', () => {
    // Desmontarlo abierto dejaría la página inerte: el elemento sale del DOM
    // sin pasar por `close()` y nunca abandona la top layer.
    render(<ConflictDialog />);

    expect(screen.getByTestId('conflict-dialog').hasAttribute('open')).toBe(false);
  });

  it('ofrece las dos salidas cuando hay conflicto', () => {
    useEditorStore.setState({ groups: groupsWith([A]), conflict: CONFLICT });

    render(<ConflictDialog />);

    expect(screen.getByText('Cambió en el disco.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sobrescribir el archivo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Descartar mis cambios' })).toBeDefined();
  });

  it('sobrescribir guarda sin mandar el expectedMtimeMs', async () => {
    const invoke = installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 300 } } });
    useEditorStore.setState({
      groups: groupsWith([A]),
      mtimes: { [A]: 100 },
      conflict: CONFLICT,
      readContent: () => 'mio',
    });
    render(<ConflictDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Sobrescribir el archivo' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('fs:writeFile', { path: A, content: 'mio' });
    });
  });

  it('descartar relee el archivo del disco', async () => {
    installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'del disco', mtimeMs: 900 } },
    });
    useEditorStore.setState({
      groups: groupsWith([A]),
      conflict: CONFLICT,
      readContent: () => 'mio',
    });
    render(<ConflictDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Descartar mis cambios' }));

    await waitFor(() => {
      expect(useEditorStore.getState().pendingFile?.content).toBe('del disco');
    });
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});
