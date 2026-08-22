import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAiStore } from '../../stores/ai-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { ApiKeyDialog } from './ApiKeyDialog.js';

/**
 * jsdom no implementa `showModal` ni `close`.
 *
 * Se moquean sobre el prototipo y no se saltean: **lo que hay que verificar es
 * justamente que se llamen**, porque sin `showModal` el `<dialog>` se pinta
 * pero no entra en la top layer — y ése era el bug: el diálogo caía adentro de
 * la grilla de `.app`, en la columna de 3rem del rail.
 */
function stubDialog(): {
  showModal: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  });

  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;

  return { showModal, close };
}

/**
 * Monta el diálogo **ya abierto**.
 *
 * Abrirlo después de `render` obligaría a un `act` en cada test para nada: lo
 * que se verifica acá es lo que pasa con el diálogo abierto, no la transición.
 */
function renderOpen(): void {
  useAiStore.setState({ isKeyDialogOpen: true });
  render(<ApiKeyDialog />);
}

beforeEach(() => {
  useAiStore.setState({ isKeyDialogOpen: false, hasKey: false, canPersist: true });
});

describe('ApiKeyDialog', () => {
  it('no muestra nada mientras está cerrado', () => {
    stubDialog();
    render(<ApiKeyDialog />);

    expect(screen.queryByTestId('ai-key-input')).toBeNull();
  });

  it('entra en la top layer con showModal y no como un hijo más de la grilla', () => {
    // Es el bug que se arregló: sin `showModal` el diálogo se acomodaba en la
    // columna del rail de actividades y el texto salía a una palabra por línea.
    const { showModal } = stubDialog();

    renderOpen();

    expect(showModal).toHaveBeenCalled();
    expect(screen.getByTestId('ai-key-input')).toBeDefined();
  });

  it('cierra el elemento nativo cuando el store se cierra', () => {
    const { close } = stubDialog();
    renderOpen();

    act(() => {
      useAiStore.setState({ isKeyDialogOpen: false });
    });

    expect(close).toHaveBeenCalled();
  });

  it('avisa antes de escribirla cuando el sistema no la puede guardar', () => {
    // Enterarse al reabrir la app es la peor forma de enterarse.
    stubDialog();
    useAiStore.setState({ canPersist: false });

    renderOpen();

    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('no deja guardar una clave vacía', () => {
    stubDialog();
    renderOpen();

    expect(screen.getByTestId('ai-key-save').hasAttribute('disabled')).toBe(true);
  });

  it('manda la clave por el único canal que la lleva', async () => {
    const invoke = installFakeApi({
      'ai:setApiKey': { ok: true, value: {} },
      'ai:listModels': { ok: true, value: { models: [] } },
    });
    stubDialog();
    renderOpen();

    await userEvent.type(screen.getByTestId('ai-key-input'), 'sk-or-v1-secreta');
    await userEvent.click(screen.getByTestId('ai-key-save'));

    expect(invoke).toHaveBeenCalledWith('ai:setApiKey', { apiKey: 'sk-or-v1-secreta' });
  });

  it('el campo es de tipo password: el caso real es alguien mirando la pantalla', () => {
    stubDialog();
    renderOpen();

    expect(screen.getByTestId('ai-key-input').getAttribute('type')).toBe('password');
  });

  it('no ofrece borrar una clave que no existe', () => {
    stubDialog();
    renderOpen();

    expect(screen.queryByTestId('ai-key-clear')).toBeNull();
  });

  it('olvida lo tipeado al cerrarse, que es lo mínimo para un secreto', async () => {
    // El estado del campo vive en un componente que se monta con el diálogo,
    // así que cerrarlo lo destruye en vez de dejar el secreto en memoria.
    stubDialog();
    installFakeApi({});
    renderOpen();

    await userEvent.type(screen.getByTestId('ai-key-input'), 'sk-or-v1-secreta');
    await userEvent.click(screen.getByTestId('ai-key-cancel'));

    act(() => {
      useAiStore.setState({ isKeyDialogOpen: true });
    });

    expect(screen.getByTestId('ai-key-input')).toHaveProperty('value', '');
  });
});
