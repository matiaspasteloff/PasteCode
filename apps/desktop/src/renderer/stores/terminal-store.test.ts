import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useTerminalStore } from './terminal-store.js';

/** Una sesión cualquiera, para no repetir el literal en cada caso. */
function session(sessionId: string, displayName = 'powershell') {
  return { sessionId, displayName, pid: 1234 };
}

beforeEach(() => {
  useTerminalStore.setState({
    sessions: [],
    activeSessionId: null,
    hasFocus: false,
    error: null,
  });
});

describe('useTerminalStore', () => {
  it('deja activa la sesión recién creada', async () => {
    installFakeApi({ 'terminal:create': { ok: true, value: session('terminal-1') } });

    await useTerminalStore.getState().create({ cols: 80, rows: 24 });

    expect(useTerminalStore.getState().sessions).toHaveLength(1);
    expect(useTerminalStore.getState().activeSessionId).toBe('terminal-1');
  });

  it('guarda el error del main sin dejar una sesión a medias', async () => {
    installFakeApi({
      'terminal:create': {
        ok: false,
        error: { code: 'WORKSPACE_NOT_OPEN', userMessage: 'No hay ninguna carpeta abierta.' },
      },
    });

    await useTerminalStore.getState().create({ cols: 80, rows: 24 });

    expect(useTerminalStore.getState().sessions).toHaveLength(0);
    expect(useTerminalStore.getState().error?.code).toBe('WORKSPACE_NOT_OPEN');
  });

  it('crea la primera sesión cuando no hay ninguna', async () => {
    installFakeApi({ 'terminal:create': { ok: true, value: session('terminal-1') } });

    await useTerminalStore.getState().ensureSession();

    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('no crea una segunda sesión si ya había una', async () => {
    // Es lo que hace que abrir y cerrar el panel varias veces no deje una pila
    // de shells vivos. Si el panel se ve o no ya no es asunto de este store.
    const invoke = installFakeApi({
      'terminal:create': { ok: true, value: session('terminal-1') },
    });

    await useTerminalStore.getState().ensureSession();
    await useTerminalStore.getState().ensureSession();

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('no saca la sesión de la lista hasta que el main avisa que murió', async () => {
    installFakeApi({ 'terminal:dispose': { ok: true, value: {} } });
    useTerminalStore.setState({
      sessions: [session('terminal-1')],
      activeSessionId: 'terminal-1',
    });

    await useTerminalStore.getState().dispose('terminal-1');

    // El proceso todavía puede estar escupiendo su última línea.
    expect(useTerminalStore.getState().sessions).toHaveLength(1);
  });

  it('olvida una sesión cuando llega su salida', () => {
    useTerminalStore.setState({
      sessions: [session('terminal-1'), session('terminal-2')],
      activeSessionId: 'terminal-1',
    });

    useTerminalStore.getState().forget('terminal-1');

    expect(useTerminalStore.getState().sessions).toEqual([session('terminal-2')]);
  });

  it('pasa a la última sesión cuando muere la activa', () => {
    useTerminalStore.setState({
      sessions: [session('terminal-1'), session('terminal-2')],
      activeSessionId: 'terminal-2',
    });

    useTerminalStore.getState().forget('terminal-2');

    expect(useTerminalStore.getState().activeSessionId).toBe('terminal-1');
  });

  it('no cambia la sesión activa cuando muere otra', () => {
    useTerminalStore.setState({
      sessions: [session('terminal-1'), session('terminal-2')],
      activeSessionId: 'terminal-2',
    });

    useTerminalStore.getState().forget('terminal-1');

    expect(useTerminalStore.getState().activeSessionId).toBe('terminal-2');
  });

  it('deja la activa en null cuando muere la última', () => {
    useTerminalStore.setState({
      sessions: [session('terminal-1')],
      activeSessionId: 'terminal-1',
    });

    useTerminalStore.getState().forget('terminal-1');

    expect(useTerminalStore.getState().activeSessionId).toBeNull();
  });

  it('publica el foco, que es de donde sale la clave terminalFocus', () => {
    useTerminalStore.getState().setFocus(true);

    expect(useTerminalStore.getState().hasFocus).toBe(true);
  });
});
