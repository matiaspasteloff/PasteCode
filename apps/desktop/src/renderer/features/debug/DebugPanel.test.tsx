import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDebugStore } from '../../stores/debug-store.js';
import { installFakeApi } from '../../test-support/fake-api.js';

import { DebugPanel } from './DebugPanel.js';

let invoke: ReturnType<typeof installFakeApi>;

/** Deja el store en un estado conocido, sin heredar del caso anterior. */
function resetDebug(overrides: Partial<ReturnType<typeof useDebugStore.getState>> = {}): void {
  useDebugStore.setState({
    breakpoints: [],
    status: { state: 'idle', userMessage: null, threadId: null },
    configurations: { configurations: [], error: null },
    frames: [],
    selectedFrameId: null,
    console: [],
    ...overrides,
  });
}

/** Una configuración del `launch.json`. */
const CONFIG = { type: 'node', request: 'launch' as const, name: 'App' };

beforeEach(() => {
  invoke = installFakeApi({
    'debug:start': { ok: true, value: {} },
    'debug:stop': { ok: true, value: {} },
    'debug:step': { ok: true, value: {} },
    'debug:evaluate': { ok: true, value: { result: '2', failed: false } },
    'debug:getVariables': {
      ok: true,
      value: { variables: [{ name: 'Local', value: '', variablesReference: 2000 }] },
    },
  });

  resetDebug();
});

describe('cuando no hay adaptador', () => {
  it('explica por qué en vez de mostrar controles apagados', () => {
    resetDebug({
      status: {
        state: 'unavailable',
        userMessage: 'Configurá debug.adapterPath',
        threadId: null,
      },
    });

    render(<DebugPanel />);

    // Cinco botones deshabilitados no le dicen a nadie qué hacer para
    // habilitarlos; el mensaje sí.
    expect(screen.getByTestId('debug-unavailable').textContent).toContain('debug.adapterPath');
    expect(screen.queryByTestId('debug-continue')).toBeNull();
  });
});

describe('RF-503: los controles', () => {
  it('sin sesión ofrece arrancar las configuraciones del launch.json', async () => {
    resetDebug({ configurations: { configurations: [CONFIG], error: null } });

    render(<DebugPanel />);
    await userEvent.click(screen.getByTestId('debug-start-App'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('debug:start', { configuration: 'App' });
    });
  });

  it('sin configuraciones lo dice, en vez de un botón que no hace nada', () => {
    resetDebug();

    render(<DebugPanel />);

    expect(screen.queryByTestId('debug-start-App')).toBeNull();
  });

  it('muestra el error del launch.json roto', () => {
    resetDebug({
      configurations: {
        configurations: [],
        error: { code: 'LAUNCH_JSON_SCHEMA', userMessage: 'Falta el name' },
      },
    });

    render(<DebugPanel />);

    expect(screen.getByText('Falta el name')).toBeDefined();
  });

  it('frenado habilita los pasos y deshabilita pause', () => {
    resetDebug({ status: { state: 'stopped', userMessage: null, threadId: 1 } });

    render(<DebugPanel />);

    expect(screen.getByTestId('debug-over').hasAttribute('disabled')).toBe(false);
    // Pausar algo que ya está frenado es un comando que el adaptador contesta
    // con un error que nadie pidió.
    expect(screen.getByTestId('debug-pause').hasAttribute('disabled')).toBe(true);
  });

  it('corriendo es al revés: sólo pause', () => {
    resetDebug({ status: { state: 'running', userMessage: null, threadId: null } });

    render(<DebugPanel />);

    expect(screen.getByTestId('debug-pause').hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('debug-over').hasAttribute('disabled')).toBe(true);
  });

  it('cada control manda su paso', async () => {
    resetDebug({ status: { state: 'stopped', userMessage: null, threadId: 1 } });

    render(<DebugPanel />);
    await userEvent.click(screen.getByTestId('debug-into'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('debug:step', { step: 'into' });
    });
  });
});

describe('RF-504: la pila de llamadas', () => {
  beforeEach(() => {
    resetDebug({
      status: { state: 'stopped', userMessage: null, threadId: 1 },
      frames: [
        { id: 1, name: 'sumar', path: 'C:\\p\\a.js', line: 12 },
        { id: 2, name: 'nativo', path: null, line: 0 },
      ],
      selectedFrameId: 1,
    });
  });

  it('lista los frames con su línea', () => {
    render(<DebugPanel />);

    expect(screen.getByTestId('debug-stack').textContent).toContain('sumar');
    expect(screen.getByTestId('debug-stack').textContent).toContain(':12');
  });

  it('un frame sin archivo se muestra sin línea', () => {
    render(<DebugPanel />);

    // Un cero parecería una ubicación, y no lo es: es código nativo.
    expect(screen.getByTestId('debug-stack').textContent).not.toContain(':0');
  });

  it('elegir un frame lo marca como actual', async () => {
    render(<DebugPanel />);
    await userEvent.click(screen.getByRole('button', { name: /nativo/ }));

    expect(useDebugStore.getState().selectedFrameId).toBe(2);
  });
});

describe('RF-505: la consola', () => {
  it('muestra lo que salió del programa', () => {
    resetDebug({
      status: { state: 'stopped', userMessage: null, threadId: 1 },
      console: [{ category: 'stdout', text: 'hola' }],
    });

    render(<DebugPanel />);

    expect(screen.getByTestId('debug-console').textContent).toContain('hola');
  });

  it('evalúa una expresión y anota lo escrito antes de la respuesta', async () => {
    resetDebug({
      status: { state: 'stopped', userMessage: null, threadId: 1 },
      selectedFrameId: 7,
    });

    render(<DebugPanel />);

    const input = screen.getByTestId('debug-console-input');

    await userEvent.type(input, 'a + 1{Enter}');

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('debug:evaluate', {
        expression: 'a + 1',
        frameId: 7,
      });
    });

    // Lo escrito queda anotado aunque el adaptador tarde: la consola muestra
    // que la expresión se envió.
    expect(screen.getByTestId('debug-console').textContent).toContain('> a + 1');
  });

  it('no se puede escribir sin una sesión viva', () => {
    resetDebug({ status: { state: 'idle', userMessage: null, threadId: null } });

    render(<DebugPanel />);

    expect(screen.getByTestId('debug-console-input').hasAttribute('disabled')).toBe(true);
  });
});
