import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDisposers, disposeAll, registerDisposer, SHUTDOWN_GRACE_MS } from './shutdown.js';

describe('el apagado unificado', () => {
  beforeEach(() => {
    clearDisposers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearDisposers();
    vi.restoreAllMocks();
  });

  it('corre todos los disposers registrados', async () => {
    const order: string[] = [];

    registerDisposer('terminal', () => {
      order.push('terminal');
    });
    registerDisposer('search', () => {
      order.push('search');
    });

    await disposeAll();

    expect(order).toEqual(expect.arrayContaining(['terminal', 'search']));
  });

  it('le pasa a cada uno la ventana de gracia compartida', async () => {
    // Una sola ventana para todos: tres subsistemas con tres ventanas de tres
    // segundos son nueve segundos de app que parece colgada.
    const dispose = vi.fn();

    registerDisposer('terminal', dispose);
    await disposeAll();

    expect(dispose).toHaveBeenCalledWith(SHUTDOWN_GRACE_MS);
  });

  it('espera a los disposers asincrónicos', async () => {
    let finished = false;

    registerDisposer('terminal', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished = true;
    });

    await disposeAll();

    expect(finished).toBe(true);
  });

  it('corre los demás aunque uno falle', async () => {
    // Cerrar es lo último que pasa: "uno de los cinco tiró" no puede
    // convertirse en "los otros cuatro quedaron con procesos huérfanos".
    const survivor = vi.fn();

    registerDisposer('roto', () => Promise.reject(new Error('no pude')));
    registerDisposer('search', survivor);

    await expect(disposeAll()).resolves.toBeUndefined();
    expect(survivor).toHaveBeenCalledOnce();
  });

  it('deja rastro del que falló en vez de tragárselo', async () => {
    registerDisposer('roto', () => {
      throw new Error('no pude');
    });

    await disposeAll();

    expect(console.error).toHaveBeenCalledOnce();
  });

  it('reemplaza el disposer anterior si se registra el mismo nombre', async () => {
    const stale = vi.fn();
    const fresh = vi.fn();

    registerDisposer('terminal', stale);
    registerDisposer('terminal', fresh);

    await disposeAll();

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledOnce();
  });

  it('no hace nada si no hay nada registrado', async () => {
    await expect(disposeAll()).resolves.toBeUndefined();
  });
});
