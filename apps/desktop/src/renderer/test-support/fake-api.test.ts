import { describe, expect, it, vi } from 'vitest';

import { emitFakeEvent, installFakeApi } from './fake-api.js';

/**
 * El soporte de tests tiene sus propios tests porque es el que sostiene a
 * todos los demás: un `emitFakeEvent` que no llama a nadie haría pasar en
 * verde a cualquier componente que se olvide de suscribirse.
 */
describe('el api falso, sobre eventos', () => {
  it('entrega el payload a quien se suscribió', () => {
    installFakeApi({});
    const onData = vi.fn();

    window.pastecode.subscribe('terminal:data', onData);
    emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'hola' });

    expect(onData).toHaveBeenCalledWith({ sessionId: 'a', chunk: 'hola' });
  });

  it('entrega a todos los suscriptores del mismo evento', () => {
    installFakeApi({});
    const first = vi.fn();
    const second = vi.fn();

    window.pastecode.subscribe('terminal:data', first);
    window.pastecode.subscribe('terminal:data', second);
    emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'x' });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('no le entrega a quien escucha otro evento', () => {
    installFakeApi({});
    const onExit = vi.fn();

    window.pastecode.subscribe('terminal:exit', onExit);
    window.pastecode.subscribe('terminal:data', vi.fn());
    emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'x' });

    expect(onExit).not.toHaveBeenCalled();
  });

  it('deja de entregar después del unsubscribe', () => {
    installFakeApi({});
    const onData = vi.fn();

    const unsubscribe = window.pastecode.subscribe('terminal:data', onData);
    unsubscribe();

    expect(() => {
      emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'x' });
    }).toThrow('Nadie está suscripto');
    expect(onData).not.toHaveBeenCalled();
  });

  it('falla si nadie se suscribió, en vez de no hacer nada', () => {
    installFakeApi({});

    expect(() => {
      emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'x' });
    }).toThrow('terminal:data');
  });

  it('olvida las suscripciones del test anterior al reinstalarse', () => {
    installFakeApi({});
    const stale = vi.fn();
    window.pastecode.subscribe('terminal:data', stale);

    installFakeApi({});

    expect(() => {
      emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'x' });
    }).toThrow();
    expect(stale).not.toHaveBeenCalled();
  });
});
