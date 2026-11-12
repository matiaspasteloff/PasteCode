import type { UpdateState } from '@pastecode/core';
import { CommandRegistry, initialUpdateState, reduceUpdateState } from '@pastecode/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/command-store.js';
import { useUpdateStore } from '../../stores/update-store.js';
import { emitFakeEvent, installFakeApi } from '../../test-support/fake-api.js';

import { StatusUpdate } from './StatusUpdate.js';

const idle = initialUpdateState('0.3.1', true, true);
const available = reduceUpdateState(idle, { type: 'available', version: '0.4.0' });

/** Monta el componente con el estado inicial que devuelva el main. */
async function mount(state: UpdateState): Promise<void> {
  installFakeApi({ 'update:getState': { ok: true, value: state } });
  render(<StatusUpdate />);
  await act(() => Promise.resolve());
}

/** Registra un comando espía y lo devuelve. */
function spyCommand(id: string) {
  const handler = vi.fn();
  useCommandStore
    .getState()
    .registry.register({ id, title: 'command.appCheckForUpdates', handler });
  return handler;
}

beforeEach(() => {
  useCommandStore.setState({ registry: new CommandRegistry(), revision: 0, error: null });
  useUpdateStore.setState({ state: null, requested: false });
});

describe('StatusUpdate', () => {
  it('no muestra nada mientras no hay nada que decir', async () => {
    await mount(idle);

    expect(screen.queryByTestId('status-update')).toBeNull();
  });

  it('no muestra unsupported si nadie pidió buscar', async () => {
    await mount(initialUpdateState('0.3.1', false, false));

    expect(screen.queryByTestId('status-update')).toBeNull();
  });

  it('una versión nueva instalable ofrece descargarla, y sólo al hacer clic', async () => {
    const download = spyCommand('app.downloadUpdate');
    await mount(available);

    const item = screen.getByTestId('status-update');
    expect(item.textContent).toContain('0.4.0');
    expect(download).not.toHaveBeenCalled();

    await userEvent.click(item);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('una versión nueva no instalable ofrece la página del release', async () => {
    const open = spyCommand('app.openReleasePage');
    const download = spyCommand('app.downloadUpdate');
    await mount({ ...available, canInstallInApp: false });

    await userEvent.click(screen.getByTestId('status-update'));

    expect(open).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it('sigue los cambios que empuja el main', async () => {
    await mount(idle);

    act(() => {
      emitFakeEvent('update:stateChanged', {
        ...available,
        status: 'downloading',
        percent: 40,
      });
    });

    expect(screen.getByTestId('status-update').textContent).toContain('40%');
  });

  it('después de pedir, unsupported se ve y lleva a la página del release', async () => {
    const open = spyCommand('app.openReleasePage');
    useUpdateStore.setState({ requested: true });
    await mount(initialUpdateState('0.3.1', false, false));

    const item = screen.getByTestId('status-update');
    expect(item.getAttribute('data-state')).toBe('unsupported');

    await userEvent.click(item);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
