import { CommandRegistry } from '@pastecode/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../stores/command-store.js';
import { useKeybindingsStore } from '../stores/keybindings-store.js';

import { MenuBar } from './MenuBar.js';

/** Registra un comando con un handler que no hace nada más que registrarse. */
function register(id: string, title: string, handler = (): void => undefined): void {
  useCommandStore.getState().registry.register({ id, title, handler });
}

beforeEach(() => {
  useCommandStore.setState({ registry: new CommandRegistry(), revision: 0 });
  useKeybindingsStore.setState({ bindings: [] });
});

describe('MenuBar', () => {
  it('dibuja los siete menús de la barra', () => {
    render(<MenuBar />);

    expect(screen.getByTestId('menu-trigger-file')).toBeDefined();
    expect(screen.getByTestId('menu-trigger-help')).toBeDefined();
  });

  it('abre el desplegable al clickear un título', async () => {
    register('file.save', 'command.fileSave');
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));

    expect(screen.getByTestId('menu-file')).toBeDefined();
    expect(screen.getByTestId('menu-item-file.save')).toBeDefined();
  });

  it('saca del título del comando lo que muestra, sin una segunda tabla', async () => {
    register('file.save', 'command.fileSave');
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));

    expect(screen.getByTestId('menu-item-file.save').textContent).toContain(
      'Guardar el archivo'
    );
  });

  it('muestra el atajo al lado del título', async () => {
    register('file.save', 'command.fileSave');
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));

    expect(screen.getByTestId('menu-item-file.save').textContent).toContain('Ctrl+S');
  });

  it('no dibuja los ítems cuyo comando no está registrado', async () => {
    // Es lo que hace que sacar el asistente de la etapa experimental no deje
    // tres entradas muertas en el menú Ver.
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-view'));

    expect(screen.queryByTestId('menu-item-ai.toggle')).toBeNull();
  });

  it('ejecuta el comando y cierra el menú al elegir un ítem', async () => {
    const handler = vi.fn();
    register('file.save', 'command.fileSave', handler);
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));
    await userEvent.click(screen.getByTestId('menu-item-file.save'));

    expect(handler).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('menu-file')).toBeNull();
  });

  it('cierra con Escape y devuelve el foco al título', async () => {
    register('file.save', 'command.fileSave');
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('menu-file')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('menu-trigger-file'));
  });

  it('cambia de menú con las flechas horizontales, sin cerrar', async () => {
    register('search.toggle', 'command.searchToggle');
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.queryByTestId('menu-file')).toBeNull();
    expect(screen.getByTestId('menu-edit')).toBeDefined();
  });

  it('da la vuelta al pasarse del último menú', async () => {
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-help'));
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByTestId('menu-file')).toBeDefined();
  });

  it('recorre los ítems con las flechas verticales', async () => {
    register('workspace.open', 'command.workspaceOpen');
    register('file.save', 'command.fileSave');
    render(<MenuBar />);

    await userEvent.click(screen.getByTestId('menu-trigger-file'));

    // Al abrir, el foco queda en el primero: es lo que espera el patrón.
    expect(document.activeElement).toBe(screen.getByTestId('menu-item-workspace.open'));

    await userEvent.keyboard('{ArrowDown}');

    expect(document.activeElement).toBe(screen.getByTestId('menu-item-file.save'));
  });
});
