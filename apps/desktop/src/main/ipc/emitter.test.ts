import type { EventName } from '@pastecode/ipc-contract';
import { EVENT_NAMES, isEventName } from '@pastecode/ipc-contract';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { EventRecipient } from './emitter.js';
import { emit } from './emitter.js';

/**
 * Una ventana falsa con el mínimo que `emit` mira.
 *
 * @param destroyed Estado de la ventana y de su `webContents`.
 */
function fakeRecipient(
  destroyed: { window?: boolean; webContents?: boolean } = {}
): EventRecipient & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();

  return {
    send,
    isDestroyed: () => destroyed.window ?? false,
    webContents: {
      isDestroyed: () => destroyed.webContents ?? false,
      send,
    },
  };
}

describe('emit', () => {
  it('manda el evento y su payload al webContents de la ventana', () => {
    const recipient = fakeRecipient();

    emit(recipient, 'terminal:data', { sessionId: 'a', chunk: 'hola\r\n' });

    expect(recipient.send).toHaveBeenCalledWith('terminal:data', {
      sessionId: 'a',
      chunk: 'hola\r\n',
    });
  });

  it('no manda nada si la ventana ya se destruyó', () => {
    const recipient = fakeRecipient({ window: true });

    emit(recipient, 'terminal:exit', { sessionId: 'a', exitCode: 0, signal: null });

    expect(recipient.send).not.toHaveBeenCalled();
  });

  it('no manda nada si el webContents ya se destruyó, aunque la ventana viva', () => {
    // Es el estado real durante el cierre: la ventana existe unos milisegundos
    // más que su contenido, y un PTY con salida pendiente cae justo ahí.
    const recipient = fakeRecipient({ webContents: true });

    emit(recipient, 'terminal:exit', { sessionId: 'a', exitCode: 0, signal: 15 });

    expect(recipient.send).not.toHaveBeenCalled();
  });
});

describe('EVENT_NAMES', () => {
  it('lista exactamente los eventos del contrato', () => {
    // El `satisfies` de events.ts verifica que no sobre ninguno. Que no falte
    // ninguno sólo se puede verificar comparando los dos tipos, y por eso el
    // chequeo vive en un test y no al lado de la constante: agregar un evento
    // a `IpcEvents` sin agregarlo acá deja al preload rechazándolo en runtime,
    // que es el bug más molesto de encontrar de todo este mecanismo.
    expectTypeOf<(typeof EVENT_NAMES)[number]>().toEqualTypeOf<EventName>();
  });
});

describe('isEventName', () => {
  it.each(EVENT_NAMES)('acepta %s', (name) => {
    expect(isEventName(name)).toBe(true);
  });

  it('rechaza un canal interno de Electron', () => {
    // El caso que justifica que la allow-list exista.
    expect(isEventName('ELECTRON_BROWSER_REQUIRE')).toBe(false);
  });

  it('rechaza un canal de request/response, que no es un evento', () => {
    expect(isEventName('fs:readFile')).toBe(false);
  });

  it.each([undefined, null, 42, {}, ['terminal:data']])('rechaza %o', (value) => {
    expect(isEventName(value)).toBe(false);
  });
});
