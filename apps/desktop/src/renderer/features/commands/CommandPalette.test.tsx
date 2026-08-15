import { CommandRegistry, type Command } from '@pastecode/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/command-store.js';

import { CommandPalette } from './CommandPalette.js';

/** Deja el store con un registro limpio y la paleta abierta. */
function withCommands(commands: readonly Command[], isPaletteOpen = true): void {
  const registry = new CommandRegistry();
  for (const command of commands) registry.register(command);

  useCommandStore.setState({ registry, revision: 1, isPaletteOpen, error: null });
}

const save = vi.fn();
const open = vi.fn();

beforeEach(() => {
  save.mockClear();
  open.mockClear();
  withCommands([
    { id: 'file.save', title: 'command.fileSave', handler: save },
    { id: 'workspace.open', title: 'command.workspaceOpen', handler: open },
  ]);
});

describe('CommandPalette', () => {
  it('no muestra nada mientras está cerrada', () => {
    useCommandStore.setState({ isPaletteOpen: false });

    const { container } = render(<CommandPalette />);

    expect(container.firstChild).toBeNull();
  });

  it('lista todos los comandos registrados al abrir', () => {
    render(<CommandPalette />);

    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual([
      'Guardar el archivo',
      'Abrir carpeta como workspace',
    ]);
  });

  it('muestra el título traducido y no la clave de i18n', () => {
    render(<CommandPalette />);

    expect(screen.queryByText('command.fileSave')).toBeNull();
    expect(screen.getByText('Guardar el archivo')).toBeDefined();
  });

  it('filtra por coincidencia difusa mientras se tipea', async () => {
    render(<CommandPalette />);

    await userEvent.type(screen.getByRole('combobox'), 'guardar');

    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual([
      'Guardar el archivo',
    ]);
  });

  it('avisa cuando ningún comando coincide', async () => {
    render(<CommandPalette />);

    await userEvent.type(screen.getByRole('combobox'), 'zzzz');

    expect(screen.getByText('Ningún comando coincide')).toBeDefined();
    expect(screen.queryAllByRole('option')).toEqual([]);
  });

  it('ejecuta el comando resaltado con Enter y cierra la paleta', async () => {
    render(<CommandPalette />);

    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });
    expect(useCommandStore.getState().isPaletteOpen).toBe(false);
  });

  it('mueve el resaltado con las flechas antes de ejecutar', async () => {
    render(<CommandPalette />);

    await userEvent.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('ejecuta el comando que se clickea', async () => {
    render(<CommandPalette />);

    await userEvent.click(screen.getByText('Abrir carpeta como workspace'));

    await waitFor(() => {
      expect(open).toHaveBeenCalled();
    });
  });

  it('cierra con Escape sin ejecutar nada', async () => {
    render(<CommandPalette />);

    await userEvent.keyboard('{Escape}');

    expect(useCommandStore.getState().isPaletteOpen).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('apunta aria-activedescendant a la opción resaltada', () => {
    // Es lo que le dice al lector de pantalla cuál está elegida sin mover el
    // foco real, que se queda en el input para poder seguir tipeando.
    render(<CommandPalette />);

    expect(screen.getByRole('combobox').getAttribute('aria-activedescendant')).toBe(
      'palette-option-file.save'
    );
  });

  it('deja el error de un comando roto en el estado en vez de propagarlo', async () => {
    withCommands([
      {
        id: 'roto',
        title: 'command.fileSave',
        handler: () => {
          throw new Error('boom');
        },
      },
    ]);
    render(<CommandPalette />);

    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(useCommandStore.getState().error?.code).toBe('COMMAND_FAILED');
    });
  });
});
