import type { UpdateEvent, UpdateState } from '@pastecode/core';
import { initialUpdateState } from '@pastecode/core';
import { describe, expect, it, vi } from 'vitest';

import type { UpdaterBackend } from './updater.js';
import { createUpdateService } from './updater.js';

/** Un actualizador falso: cuenta las llamadas y deja disparar eventos a mano. */
function fakeBackend() {
  let listener: ((event: UpdateEvent) => void) | undefined;
  const backend = {
    onEvent: vi.fn((next: (event: UpdateEvent) => void) => {
      listener = next;
    }),
    setAllowPrerelease: vi.fn(),
    check: vi.fn(() => Promise.resolve()),
    download: vi.fn(() => Promise.resolve()),
    install: vi.fn(),
  } satisfies UpdaterBackend;
  const fire = (event: UpdateEvent): void => {
    listener?.(event);
  };
  return { backend, fire };
}

/** Un servicio sobre el backend falso, con los cambios de estado anotados. */
function setup(options: { packaged?: boolean; installable?: boolean; beta?: boolean } = {}) {
  const { backend, fire } = fakeBackend();
  const changes: UpdateState[] = [];
  const loadBackend = vi.fn(() => Promise.resolve(backend));
  const service = createUpdateService({
    initial: initialUpdateState('0.3.1', options.installable ?? true, options.packaged ?? true),
    loadBackend,
    channel: () => (options.beta === true ? 'beta' : 'stable'),
    onChange: (state) => changes.push(state),
  });
  return { service, backend, fire, changes, loadBackend };
}

describe('createUpdateService', () => {
  it('sin empaquetar no carga el actualizador ni busca nada', async () => {
    const { service, loadBackend } = setup({ packaged: false });

    const state = await service.check();

    expect(state.status).toBe('unsupported');
    expect(loadBackend).not.toHaveBeenCalled();
  });

  it('carga el actualizador recién en el primer chequeo, y una sola vez', async () => {
    const { service, loadBackend, backend } = setup();

    expect(loadBackend).not.toHaveBeenCalled();
    await service.check();
    await service.check();

    expect(loadBackend).toHaveBeenCalledTimes(1);
    expect(backend.check).toHaveBeenCalledTimes(2);
  });

  it('nunca descarga sola: una versión disponible deja el estado en available', async () => {
    const { service, backend, fire } = setup();

    await service.check();
    fire({ type: 'available', version: '0.4.0' });

    expect(service.getState().status).toBe('available');
    expect(backend.download).not.toHaveBeenCalled();
    expect(backend.install).not.toHaveBeenCalled();
  });

  it('traduce cada evento a un estado y lo avisa', async () => {
    const { service, fire, changes } = setup();

    await service.check();
    fire({ type: 'checking' });
    fire({ type: 'available', version: '0.4.0' });
    fire({ type: 'progress', percent: 50 });
    fire({ type: 'downloaded', version: '0.4.0' });

    expect(changes.map((state) => state.status)).toEqual([
      'checking',
      'available',
      'downloading',
      'downloaded',
    ]);
  });

  it('pide los prereleases sólo en el canal beta', async () => {
    const stable = setup();
    const beta = setup({ beta: true });

    await stable.service.check();
    await beta.service.check();

    expect(stable.backend.setAllowPrerelease).toHaveBeenCalledWith(false);
    expect(beta.backend.setAllowPrerelease).toHaveBeenCalledWith(true);
  });

  it('descarga sólo a pedido, y sólo con una versión disponible', async () => {
    const { service, backend, fire } = setup();

    await service.download();
    expect(backend.download).not.toHaveBeenCalled();

    await service.check();
    fire({ type: 'available', version: '0.4.0' });
    await service.download();

    expect(backend.download).toHaveBeenCalledTimes(1);
  });

  it('no descarga ni instala cuando la instalación no se actualiza sola', async () => {
    const { service, backend, fire } = setup({ installable: false });

    await service.check();
    fire({ type: 'available', version: '0.4.0' });
    await service.download();
    fire({ type: 'downloaded', version: '0.4.0' });
    service.install();
    await Promise.resolve();

    expect(backend.download).not.toHaveBeenCalled();
    expect(backend.install).not.toHaveBeenCalled();
  });

  it('instala sólo lo descargado', async () => {
    const { service, backend, fire } = setup();

    await service.check();
    service.install();
    await Promise.resolve();
    expect(backend.install).not.toHaveBeenCalled();

    fire({ type: 'downloaded', version: '0.4.0' });
    service.install();
    await Promise.resolve();

    expect(backend.install).toHaveBeenCalledTimes(1);
  });

  it('un error del chequeo termina en el estado error y no se propaga', async () => {
    const { service, backend } = setup();
    backend.check.mockRejectedValueOnce(new Error('sin red'));

    const state = await service.check();

    expect(state).toMatchObject({ status: 'error', message: 'sin red' });
  });

  it('si el actualizador no carga, queda en error y reintenta la próxima vez', async () => {
    const { service, loadBackend, backend } = setup();
    loadBackend.mockRejectedValueOnce(new Error('no carga'));

    expect(await service.check()).toMatchObject({ status: 'error', message: 'no carga' });
    await service.check();

    expect(loadBackend).toHaveBeenCalledTimes(2);
    expect(backend.check).toHaveBeenCalledTimes(1);
  });

  it('un chequeo que falla no vuelve a cargar el actualizador ni duplica los listeners', async () => {
    const { service, loadBackend, backend } = setup();
    backend.check.mockRejectedValueOnce(new Error('sin red'));

    await service.check();
    await service.check();

    expect(loadBackend).toHaveBeenCalledTimes(1);
    expect(backend.onEvent).toHaveBeenCalledTimes(1);
  });
});
