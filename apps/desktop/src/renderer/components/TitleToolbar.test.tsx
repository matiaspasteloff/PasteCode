import { CommandRegistry } from '@pastecode/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../stores/command-store.js';
import { useKeybindingsStore } from '../stores/keybindings-store.js';
import { useViewStore } from '../stores/view-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';
import { installFakeApi } from '../test-support/fake-api.js';

import { TitleToolbar } from './TitleToolbar.js';

/** Registra un comando con el handler que el test quiera espiar. */
function register(id: string, handler = (): void => undefined): void {
  useCommandStore.getState().registry.register({ id, title: 'command.aiToggle', handler });
}

beforeEach(() => {
  // `WindowControls` pregunta por `window:isMaximized` al montar: el par
  // pregunta/evento del glifo de maximizar.
  installFakeApi({ 'window:isMaximized': { ok: true, value: { isMaximized: false } } });
  useCommandStore.setState({ registry: new CommandRegistry(), revision: 0, error: null });
  useKeybindingsStore.setState({ bindings: [] });
  useViewStore.setState({ sideView: 'explorer', panelView: null, auxView: null });
  useWorkspaceStore.setState({ workspace: null });
});

describe('TitleToolbar', () => {
  it('muestra los menús, la caja de comandos y los botones de ventana', () => {
    render(<TitleToolbar />);

    expect(screen.getByTestId('menu-trigger-file')).toBeDefined();
    expect(screen.getByTestId('toolbar-commands')).toBeDefined();
    expect(screen.getByTestId('window-minimize')).toBeDefined();
  });

  it('dibuja los glifos de ventana como SVG, sin depender de una fuente de Windows', () => {
    render(<TitleToolbar />);

    expect(screen.getByTestId('window-minimize').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('window-close').querySelector('svg')).not.toBeNull();
  });

  it('en macOS no dibuja los botones de ventana: quedan los del sistema', () => {
    installFakeApi({}, 'darwin');

    render(<TitleToolbar />);

    expect(screen.queryByTestId('window-minimize')).toBeNull();
    expect(screen.getByRole('banner').classList.contains('title-toolbar--mac')).toBe(true);
  });

  it('abre la paleta al clickear la caja de comandos', async () => {
    render(<TitleToolbar />);

    await userEvent.click(screen.getByTestId('toolbar-commands'));

    expect(useCommandStore.getState().isPaletteOpen).toBe(true);
  });

  it('cae al título vacío cuando no hay carpeta abierta', () => {
    render(<TitleToolbar />);

    expect(screen.getByTestId('toolbar-project').textContent).toBe(
      'No hay ninguna carpeta abierta'
    );
  });
});

describe('el botón del asistente', () => {
  it('dispara el comando y no la acción del store', async () => {
    // Es la regla de ADR-0022: si el botón y el atajo no pasan por el mismo
    // lugar, divergen.
    const handler = vi.fn();
    register('ai.toggle', handler);
    render(<TitleToolbar />);

    await userEvent.click(screen.getByTestId('toolbar-ai'));

    expect(handler).toHaveBeenCalledOnce();
  });

  it('dice si el panel está abierto con aria-pressed', () => {
    // Se aprieta y se suelta: clickearlo con el panel abierto lo cierra, que
    // es un botón de dos estados y no una pestaña (RNF-23).
    useViewStore.setState({ auxView: 'ai' });
    render(<TitleToolbar />);

    expect(screen.getByTestId('toolbar-ai').getAttribute('aria-pressed')).toBe('true');
  });

  it('arranca sin apretar, porque el panel arranca cerrado', () => {
    render(<TitleToolbar />);

    expect(screen.getByTestId('toolbar-ai').getAttribute('aria-pressed')).toBe('false');
  });

  it('tiene nombre accesible: el icono solo no dice nada', () => {
    render(<TitleToolbar />);

    expect(screen.getByRole('button', { name: 'Asistente' })).toBeDefined();
  });

  it('es un <button> de verdad, que es lo que la región de arrastre deja clickear', () => {
    // `.title-toolbar` es `-webkit-app-region: drag` y la regla de `no-drag`
    // sólo cubre `button`, `input`, `select` y `[role='menu']`. Un `<div>`
    // clickeable ahí no recibe clicks, y el síntoma no se parece a la causa.
    expect(screen.queryByTestId('toolbar-ai')).toBeNull();
    render(<TitleToolbar />);

    expect(screen.getByTestId('toolbar-ai').tagName).toBe('BUTTON');
  });
});
