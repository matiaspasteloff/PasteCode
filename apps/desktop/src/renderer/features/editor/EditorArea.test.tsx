import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorStore } from '../../stores/editor-store.js';
import { resetEditorStore, tabsWith } from '../../test-support/editor-state.js';

import { EditorArea } from './EditorArea.js';

// Monaco no se renderiza en jsdom: maneja su propio DOM, mide el contenedor y
// levanta un worker. Un test que lo montara verificaría el mock de jsdom, no
// el editor. Lo real lo ejerce el E2E.
vi.mock('./MonacoEditor.js', () => ({
  MonacoEditor: ({ activePath }: { activePath: string }) => (
    <div data-testid="monaco-stub">{activePath}</div>
  ),
}));

const A = 'C:\\p\\a.ts';

beforeEach(() => {
  resetEditorStore();
});

describe('EditorArea', () => {
  it('muestra el estado vacío cuando no hay pestañas', () => {
    render(<EditorArea />);

    expect(screen.getByText('Abrí una carpeta para empezar a editar.')).toBeDefined();
  });

  it('avisa que está abriendo mientras se lee el archivo', () => {
    // Sin esto, abrir un archivo grande deja la pantalla diciendo "abrí una
    // carpeta" y parece que el click no hizo nada.
    useEditorStore.setState({ isLoading: true });

    render(<EditorArea />);

    expect(screen.getByTestId('editor-loading')).toBeDefined();
  });

  it('muestra el userMessage del error y no el código técnico', () => {
    useEditorStore.setState({
      error: { code: 'BINARY_FILE_UNSUPPORTED', userMessage: 'Ese archivo es binario.' },
    });

    render(<EditorArea />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Ese archivo es binario.');
    expect(alert.textContent).not.toContain('BINARY');
  });

  it('muestra el editor con la pestaña activa', () => {
    useEditorStore.setState({ tabs: tabsWith([A]) });

    render(<EditorArea />);

    expect(screen.getByTestId('monaco-stub').textContent).toBe(A);
  });

  it('mantiene el editor en pantalla si se está abriendo otro archivo', () => {
    // Sacarlo dejaría la pantalla en blanco entre archivo y archivo.
    useEditorStore.setState({ tabs: tabsWith([A]), isLoading: true });

    render(<EditorArea />);

    expect(screen.getByTestId('monaco-stub')).toBeDefined();
  });
});
