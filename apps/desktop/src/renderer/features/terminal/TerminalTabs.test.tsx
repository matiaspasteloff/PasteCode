import type { TerminalSession } from '@pastecode/ipc-contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from '../../stores/terminal-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { TerminalTabs } from './TerminalTabs.js';

/** Una sesión cualquiera. */
function session(sessionId: string, displayName: string): TerminalSession {
  return { sessionId, displayName, pid: 1 };
}

/** Deja dos terminales abiertas con la primera visible. */
function withTwoTerminals(): void {
  useTerminalStore.setState({
    slots: [
      { slotId: 'slot-1', session: session('terminal-1', 'powershell') },
      { slotId: 'slot-2', session: session('terminal-2', 'powershell (2)') },
    ],
    activeSlotId: 'slot-1',
  });
}

beforeEach(() => {
  useTerminalStore.setState({ slots: [], activeSlotId: null, hasFocus: false, error: null });
});

describe('TerminalTabs', () => {
  it('lista una entrada por terminal, con su nombre desambiguado', () => {
    withTwoTerminals();
    render(<TerminalTabs />);

    // RF-302: la lista tiene que dejar distinguir dos terminales del mismo
    // shell, que es lo que el sufijo resuelve.
    expect(screen.getByRole('button', { name: 'powershell' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'powershell (2)' })).toBeDefined();
  });

  it('marca cuál es la terminal visible', () => {
    withTwoTerminals();
    render(<TerminalTabs />);

    expect(screen.getByRole('button', { name: 'powershell' }).ariaCurrent).toBe('true');
    expect(screen.getByRole('button', { name: 'powershell (2)' }).ariaCurrent).toBe('false');
  });

  it('cambia de terminal al elegir una', async () => {
    withTwoTerminals();
    render(<TerminalTabs />);

    await userEvent.click(screen.getByRole('button', { name: 'powershell (2)' }));

    expect(useTerminalStore.getState().activeSlotId).toBe('slot-2');
  });

  it('cierra la terminal que nombra el botón, no la activa', async () => {
    const invoke = installFakeApi({ 'terminal:dispose': { ok: true, value: {} } });
    withTwoTerminals();
    render(<TerminalTabs />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Cerrar la terminal powershell (2)' })
    );

    expect(invoke).toHaveBeenCalledWith('terminal:dispose', { sessionId: 'terminal-2' });
  });

  it('cierra una terminal con la ruedita', async () => {
    const invoke = installFakeApi({ 'terminal:dispose': { ok: true, value: {} } });
    withTwoTerminals();
    render(<TerminalTabs />);

    await userEvent.pointer({
      target: screen.getByRole('button', { name: 'powershell (2)' }),
      keys: '[MouseMiddle]',
    });

    expect(invoke).toHaveBeenCalledWith('terminal:dispose', { sessionId: 'terminal-2' });
  });

  it('abre otra terminal, sin lanzar nada todavía', async () => {
    // El PTY lo pide la superficie cuando xterm terminó de medir: acá sólo se
    // suma el slot.
    const invoke = installFakeApi({});
    render(<TerminalTabs />);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir otra terminal' }));

    expect(useTerminalStore.getState().slots).toHaveLength(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('muestra un nombre provisorio mientras xterm mide', () => {
    // Dura milisegundos, pero una entrada en blanco se ve peor que una palabra.
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: null }],
      activeSlotId: 'slot-1',
    });
    render(<TerminalTabs />);

    expect(screen.getByRole('button', { name: 'Abriendo…' })).toBeDefined();
  });

  it('se dibuja sin ninguna terminal abierta', () => {
    render(<TerminalTabs />);

    // Pasa al cerrar la última: el panel sigue abierto y tiene que ofrecer
    // abrir otra en vez de quedar en blanco.
    expect(screen.getByRole('button', { name: 'Abrir otra terminal' })).toBeDefined();
  });

  it('ya no duplica el botón de esconder el panel', () => {
    // El panel inferior ya tiene el suyo a la derecha. Dos botones para lo
    // mismo, uno al lado del otro, era el bug de layout que esto arregla.
    withTwoTerminals();
    render(<TerminalTabs />);

    expect(screen.queryByRole('button', { name: 'Ocultar el panel de terminales' })).toBeNull();
  });
});
