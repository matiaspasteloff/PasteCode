import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { WorkspaceHeader } from './WorkspaceHeader.js';

const PROJECT = { root: 'C:\\p\\PasteCode', name: 'PasteCode' };

beforeEach(() => {
  // El store es de módulo y no tiene provider. Ver ADR-0004.
  useWorkspaceStore.setState({ workspace: null, isOpening: false, error: null });
});

describe('WorkspaceHeader', () => {
  it('muestra el estado vacío mientras no hay carpeta abierta', () => {
    installFakeApi({});

    render(<WorkspaceHeader />);

    expect(screen.getByTestId('workspace-name').textContent).toBe(
      'No hay ninguna carpeta abierta'
    );
  });

  it('muestra el nombre de la carpeta después de abrirla', async () => {
    installFakeApi({ 'workspace:open': { ok: true, value: PROJECT } });
    render(<WorkspaceHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir carpeta' }));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-name').textContent).toBe('PasteCode');
    });
  });

  it('conserva el workspace abierto si se cancela el diálogo', async () => {
    // Cancelar devuelve `ok: true` con valor null. No es un error y no tiene
    // que borrar lo que ya estaba abierto.
    installFakeApi({ 'workspace:open': { ok: true, value: null } });
    useWorkspaceStore.setState({ workspace: PROJECT });
    render(<WorkspaceHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir carpeta' }));

    await waitFor(() => {
      expect(screen.queryByTestId('workspace-error')).toBeNull();
    });
    expect(screen.getByTestId('workspace-name').textContent).toBe('PasteCode');
  });

  it('muestra el userMessage del error y nunca el mensaje técnico', async () => {
    // RNF-25: lo que se ve en pantalla es accionable por una persona. El
    // `message` y el stack quedaron en el log del main.
    installFakeApi({
      'workspace:open': {
        ok: false,
        error: { code: 'FILE_ACCESS_DENIED', userMessage: 'No se pudo acceder a la carpeta.' },
      },
    });
    render(<WorkspaceHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir carpeta' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('No se pudo acceder a la carpeta.');
    expect(alert.textContent).not.toContain('FILE_ACCESS_DENIED');
  });

  it('deshabilita el botón mientras el diálogo está abierto', () => {
    installFakeApi({});
    useWorkspaceStore.setState({ isOpening: true });

    render(<WorkspaceHeader />);

    const button = screen.getByRole('button', { name: 'Abriendo…' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
