import type { TerminalSession } from '@pastecode/ipc-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { selectActiveSession, useTerminalStore } from './terminal-store.js';

/** Una sesión cualquiera, para no repetir el literal en cada caso. */
function session(sessionId: string, displayName = 'powershell'): TerminalSession {
  return { sessionId, displayName, pid: 1234 };
}

/** El id del único slot abierto. Falla el test si no hay exactamente uno. */
function onlySlotId(): string {
  const [slot] = useTerminalStore.getState().slots;

  if (slot === undefined) throw new Error('no hay ningún slot abierto');

  return slot.slotId;
}

/** Un tamaño ya medido por xterm, como el que manda la superficie. */
const MEASURED = { cols: 120, rows: 30 };

beforeEach(() => {
  useTerminalStore.setState({
    slots: [],
    activeSlotId: null,
    hasFocus: false,
    error: null,
  });
});

describe('openSlot', () => {
  it('abre una terminal sin proceso y la deja activa', () => {
    // El slot existe antes que el PTY: es lo que permite montar xterm, medir,
    // y recién ahí pedir la sesión con el tamaño real.
    useTerminalStore.getState().openSlot();

    const state = useTerminalStore.getState();

    expect(state.slots).toHaveLength(1);
    expect(state.slots[0]?.session).toBeNull();
    expect(state.activeSlotId).toBe(state.slots[0]?.slotId);
  });

  it('no lanza ningún proceso por sí solo', () => {
    const invoke = installFakeApi({});

    useTerminalStore.getState().openSlot();

    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('ensureSlot', () => {
  it('abre la primera terminal cuando no hay ninguna', () => {
    useTerminalStore.getState().ensureSlot();

    expect(useTerminalStore.getState().slots).toHaveLength(1);
  });

  it('no abre una segunda si ya había una', () => {
    // Es lo que hace que abrir y cerrar el panel varias veces no deje una pila
    // de shells vivos. Si el panel se ve o no ya no es asunto de este store.
    useTerminalStore.getState().ensureSlot();
    useTerminalStore.getState().ensureSlot();

    expect(useTerminalStore.getState().slots).toHaveLength(1);
  });
});

describe('attachSession', () => {
  it('pide el PTY con el tamaño medido, no con uno de fábrica', async () => {
    // El `80×24` escrito a mano era la causa raíz del prompt roto: el resize
    // posterior hacía que conpty reprodujera su buffer.
    const invoke = installFakeApi({
      'terminal:create': { ok: true, value: session('terminal-1') },
    });
    useTerminalStore.getState().openSlot();

    await useTerminalStore.getState().attachSession(onlySlotId(), MEASURED);

    expect(invoke).toHaveBeenCalledWith('terminal:create', MEASURED);
    expect(useTerminalStore.getState().slots[0]?.session).toEqual(session('terminal-1'));
  });

  it('no pide nada para un slot que se cerró mientras xterm medía', async () => {
    // Pedir un PTY para una terminal que ya no está sería dejar un shell sin
    // dueño, que es exactamente lo que RNF-10 prohíbe.
    const invoke = installFakeApi({});

    await useTerminalStore.getState().attachSession('slot-inexistente', MEASURED);

    expect(invoke).not.toHaveBeenCalled();
  });

  it('saca el slot y guarda el error si el main no pudo lanzar el shell', async () => {
    installFakeApi({
      'terminal:create': {
        ok: false,
        error: { code: 'WORKSPACE_NOT_OPEN', userMessage: 'No hay ninguna carpeta abierta.' },
      },
    });
    useTerminalStore.getState().openSlot();

    await useTerminalStore.getState().attachSession(onlySlotId(), MEASURED);

    expect(useTerminalStore.getState().slots).toHaveLength(0);
    expect(useTerminalStore.getState().error?.code).toBe('WORKSPACE_NOT_OPEN');
  });
});

describe('close', () => {
  it('no saca la terminal de la lista hasta que el main avisa que murió', async () => {
    const invoke = installFakeApi({ 'terminal:dispose': { ok: true, value: {} } });
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: session('terminal-1') }],
      activeSlotId: 'slot-1',
    });

    await useTerminalStore.getState().close('slot-1');

    // El proceso todavía puede estar escupiendo su última línea.
    expect(useTerminalStore.getState().slots).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith('terminal:dispose', { sessionId: 'terminal-1' });
  });

  it('saca en el momento la que todavía no tenía proceso', async () => {
    // Sin PTY no hay `terminal:exit` que esperar: si no se la sacara acá, el
    // slot quedaría para siempre.
    const invoke = installFakeApi({});
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: null }],
      activeSlotId: 'slot-1',
    });

    await useTerminalStore.getState().close('slot-1');

    expect(useTerminalStore.getState().slots).toHaveLength(0);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('forget', () => {
  it('olvida una terminal cuando llega la salida de su proceso', () => {
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: session('terminal-1') }],
      activeSlotId: 'slot-1',
    });

    useTerminalStore.getState().forget('terminal-1');

    expect(useTerminalStore.getState().slots).toHaveLength(0);
    expect(useTerminalStore.getState().activeSlotId).toBeNull();
  });

  it('pasa a la última al cerrarse la activa', () => {
    useTerminalStore.setState({
      slots: [
        { slotId: 'slot-1', session: session('terminal-1') },
        { slotId: 'slot-2', session: session('terminal-2', 'powershell (2)') },
      ],
      activeSlotId: 'slot-1',
    });

    useTerminalStore.getState().forget('terminal-1');

    expect(useTerminalStore.getState().activeSlotId).toBe('slot-2');
  });

  it('ignora la salida de una sesión que no es de ninguna terminal abierta', () => {
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: session('terminal-1') }],
      activeSlotId: 'slot-1',
    });

    useTerminalStore.getState().forget('terminal-inexistente');

    expect(useTerminalStore.getState().slots).toHaveLength(1);
  });
});

describe('selectActiveSession', () => {
  it('devuelve la sesión de la terminal visible', () => {
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: session('terminal-1') }],
      activeSlotId: 'slot-1',
    });

    expect(selectActiveSession(useTerminalStore.getState())?.sessionId).toBe('terminal-1');
  });

  it('devuelve null mientras la terminal visible todavía no tiene proceso', () => {
    useTerminalStore.setState({
      slots: [{ slotId: 'slot-1', session: null }],
      activeSlotId: 'slot-1',
    });

    expect(selectActiveSession(useTerminalStore.getState())).toBeNull();
  });
});
