import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TerminalTabs } from './TerminalTabs.js';

/** Las props obligatorias, para que cada caso declare sólo lo que le importa. */
function renderTabs(overrides: Partial<React.ComponentProps<typeof TerminalTabs>> = {}) {
  const props = {
    sessions: [
      { sessionId: 'terminal-1', displayName: 'powershell', pid: 1 },
      { sessionId: 'terminal-2', displayName: 'powershell (2)', pid: 2 },
    ],
    activeSessionId: 'terminal-1',
    onActivate: vi.fn(),
    onDispose: vi.fn(),
    onCreate: vi.fn(),
    onClosePanel: vi.fn(),
    ...overrides,
  };

  render(<TerminalTabs {...props} />);

  return props;
}

describe('TerminalTabs', () => {
  it('lista una entrada por sesión, con su nombre desambiguado', () => {
    renderTabs();

    // RF-302: el dropdown tiene que dejar distinguir dos terminales del mismo
    // shell, que es lo que el sufijo resuelve.
    expect(screen.getByRole('button', { name: 'powershell' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'powershell (2)' })).toBeDefined();
  });

  it('marca cuál es la sesión visible', () => {
    renderTabs();

    expect(screen.getByRole('button', { name: 'powershell' }).ariaCurrent).toBe('true');
    expect(screen.getByRole('button', { name: 'powershell (2)' }).ariaCurrent).toBe('false');
  });

  it('avisa qué sesión se eligió', async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole('button', { name: 'powershell (2)' }));

    expect(props.onActivate).toHaveBeenCalledWith('terminal-2');
  });

  it('cierra la sesión que nombra el botón, no la activa', async () => {
    const props = renderTabs();

    await userEvent.click(
      screen.getByRole('button', { name: 'Cerrar la terminal powershell (2)' })
    );

    expect(props.onDispose).toHaveBeenCalledWith('terminal-2');
  });

  it('ofrece abrir otra terminal y esconder el panel', async () => {
    const props = renderTabs();

    await userEvent.click(screen.getByRole('button', { name: 'Abrir otra terminal' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Ocultar el panel de terminales' })
    );

    expect(props.onCreate).toHaveBeenCalledOnce();
    expect(props.onClosePanel).toHaveBeenCalledOnce();
  });

  it('se dibuja sin ninguna sesión', () => {
    renderTabs({ sessions: [], activeSessionId: null });

    // Pasa al cerrar la última: el panel sigue abierto y tiene que ofrecer
    // abrir otra en vez de quedar en blanco.
    expect(screen.getByRole('button', { name: 'Abrir otra terminal' })).toBeDefined();
  });
});
