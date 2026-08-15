import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorStore } from '../../stores/editor-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { ConflictDialog } from './ConflictDialog.js';
import { OpenFileBar } from './OpenFileBar.js';
import { useSaveShortcut } from './use-save-shortcut.js';

const FILE = { path: 'C:\\p\\saludo.ts', content: 'viejo', mtimeMs: 100 };
const CONFLICT = { code: 'STALE_FILE', userMessage: 'Cambió en el disco.' };

beforeEach(() => {
  useEditorStore.setState({
    file: null,
    isLoading: false,
    isSaving: false,
    isDirty: false,
    error: null,
    conflict: null,
    readContent: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenFileBar', () => {
  it('no muestra nada si no hay archivo abierto', () => {
    const { container } = render(<OpenFileBar />);

    expect(container.firstChild).toBeNull();
  });

  it('muestra el nombre del archivo, sin la ruta', () => {
    useEditorStore.setState({ file: FILE });

    render(<OpenFileBar />);

    expect(screen.getByText('saludo.ts')).toBeDefined();
  });

  it('muestra el punto de cambios sin guardar sólo cuando está sucio', () => {
    useEditorStore.setState({ file: FILE });
    const { rerender } = render(<OpenFileBar />);
    expect(screen.queryByTestId('tab-dirty-indicator')).toBeNull();

    useEditorStore.setState({ isDirty: true });
    rerender(<OpenFileBar />);

    expect(screen.getByTestId('tab-dirty-indicator')).toBeDefined();
  });

  it('no avisa nada si el guardado termina rápido', () => {
    // RNF-24 pide feedback para lo que pasa de 500ms, y sólo para eso: un
    // "Guardando…" que parpadea da sensación de lentitud justo cuando fue
    // rápido.
    vi.useFakeTimers();
    useEditorStore.setState({ file: FILE, isSaving: true });

    render(<OpenFileBar />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByText('Guardando…')).toBeNull();
  });

  it('avisa que está guardando cuando pasa de 500ms', async () => {
    vi.useFakeTimers();
    useEditorStore.setState({ file: FILE, isSaving: true });
    render(<OpenFileBar />);

    // `act` porque el temporizador dispara un `setState`: sin envolverlo,
    // React no llega a aplicar el re-render antes de la aserción.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByText('Guardando…')).toBeDefined();
  });
});

describe('ConflictDialog', () => {
  it('mantiene el diálogo montado y cerrado mientras no hay conflicto', () => {
    // Desmontarlo abierto dejaría la página inerte: el elemento sale del DOM
    // sin pasar por `close()` y nunca abandona la top layer.
    render(<ConflictDialog />);

    const dialog = screen.getByTestId('conflict-dialog');
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('ofrece las dos salidas cuando hay conflicto', () => {
    useEditorStore.setState({ file: FILE, conflict: CONFLICT });

    render(<ConflictDialog />);

    expect(screen.getByText('Cambió en el disco.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sobrescribir el archivo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Descartar mis cambios' })).toBeDefined();
  });

  it('sobrescribir guarda sin mandar el expectedMtimeMs', async () => {
    const invoke = installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 300 } } });
    useEditorStore.setState({ file: FILE, conflict: CONFLICT, readContent: () => 'mio' });
    render(<ConflictDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Sobrescribir el archivo' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('fs:writeFile', {
        path: FILE.path,
        content: 'mio',
      });
    });
  });

  it('descartar relee el archivo del disco', async () => {
    installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'del disco', mtimeMs: 900 } },
    });
    useEditorStore.setState({ file: FILE, conflict: CONFLICT, readContent: () => 'mio' });
    render(<ConflictDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Descartar mis cambios' }));

    await waitFor(() => {
      expect(useEditorStore.getState().file?.content).toBe('del disco');
    });
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});

/** Componente mínimo cuyo único trabajo es instalar el atajo. */
function SaveShortcutHost(): React.JSX.Element {
  useSaveShortcut();

  return <div data-testid="host" />;
}

describe('useSaveShortcut', () => {
  it('guarda con Ctrl+S', async () => {
    const invoke = installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 200 } } });
    useEditorStore.setState({ file: FILE, isDirty: true, readContent: () => 'nuevo' });
    render(<SaveShortcutHost />);

    await userEvent.keyboard('{Control>}s{/Control}');

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('fs:writeFile', {
        path: FILE.path,
        content: 'nuevo',
        expectedMtimeMs: 100,
      });
    });
  });

  it('ignora las teclas que no son Ctrl+S', async () => {
    const invoke = installFakeApi({});
    useEditorStore.setState({ file: FILE, readContent: () => 'nuevo' });
    render(<SaveShortcutHost />);

    await userEvent.keyboard('s');
    await userEvent.keyboard('{Control>}a{/Control}');

    expect(invoke).not.toHaveBeenCalled();
  });
});
