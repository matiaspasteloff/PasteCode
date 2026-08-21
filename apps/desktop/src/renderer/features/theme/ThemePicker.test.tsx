import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useExtensionsStore } from '../../stores/extensions-store.js';
import { useThemeStore } from '../../stores/theme-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { ThemePicker } from './ThemePicker.js';

beforeEach(() => {
  useThemeStore.setState({ isPickerOpen: true, preview: null });
  useExtensionsStore.setState({ themes: [] });
  installFakeApi({});
});

describe('ThemePicker', () => {
  it('lista los nueve temas incorporados', () => {
    render(<ThemePicker />);

    expect(screen.getByRole('option', { name: /Dracula/ })).toBeDefined();
    expect(screen.getByRole('option', { name: /Alto Contraste/ })).toBeDefined();
  });

  it('previsualiza el primero apenas se abre', () => {
    // Sin esto, el selector se abriría sin mostrar nada hasta la primera flecha.
    render(<ThemePicker />);

    expect(useThemeStore.getState().preview).toBe('dracula');
  });

  it('cambia el preview al mover la selección', async () => {
    render(<ThemePicker />);

    await userEvent.keyboard('{ArrowDown}');

    expect(useThemeStore.getState().preview).toBe('one-dark');
  });

  it('restaura al cancelar: el preview era prestado, no elegido', async () => {
    render(<ThemePicker />);
    await userEvent.keyboard('{ArrowDown}');

    await userEvent.keyboard('{Escape}');

    expect(useThemeStore.getState().preview).toBeNull();
    expect(useThemeStore.getState().isPickerOpen).toBe(false);
  });

  it('guarda el tema elegido en las settings del usuario', async () => {
    // En las del usuario y no en las del workspace: el tema es una preferencia
    // de la persona, y escribirlo en el `.pastecode/` de un repositorio se lo
    // impondría a cualquiera que lo clone.
    const invoke = installFakeApi({
      'settings:update': { ok: true, value: { settings: null, error: null } },
    });
    render(<ThemePicker />);

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(invoke).toHaveBeenCalledWith('settings:update', {
      scope: 'user',
      settings: { window: { colorTheme: 'one-dark' } },
    });
    expect(useThemeStore.getState().preview).toBeNull();
  });

  it('lista también los temas de extensión, con el nombre de quién los aporta', () => {
    useExtensionsStore.setState({
      themes: [
        {
          id: 'nord',
          label: 'Nord',
          uiTheme: 'dark',
          extension: 'theme-nord',
          colors: {},
          tokenColors: [],
        },
      ],
    });
    render(<ThemePicker />);

    expect(screen.getByRole('option', { name: /Nord/ }).textContent).toContain('theme-nord');
  });

  it('filtra por nombre', async () => {
    render(<ThemePicker />);

    await userEvent.type(screen.getByRole('combobox'), 'gruv');

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(useThemeStore.getState().preview).toBe('gruvbox');
  });

  it('no se dibuja con el selector cerrado', () => {
    useThemeStore.setState({ isPickerOpen: false });
    render(<ThemePicker />);

    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
