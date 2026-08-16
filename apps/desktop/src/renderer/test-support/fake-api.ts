import type {
  ChannelName,
  EventName,
  EventPayload,
  IpcResult,
  Response,
} from '@pastecode/ipc-contract';
import { vi } from 'vitest';

/** Respuestas por canal. Lo que no esté acá falla con un error explícito. */
export type FakeResponses = {
  [C in ChannelName]?: IpcResult<Response<C>>;
};

/** Lo que `subscribe` registró, por evento. Se reinicia en cada instalación. */
let listeners = new Map<EventName, Set<(payload: never) => void>>();

/**
 * Instala un `window.pastecode` falso con respuestas fijas por canal.
 *
 * Es el único mock que los tests de renderer necesitan, y no es accidental:
 * el renderer no habla con nadie más que con el preload. Si algún día un
 * componente necesita más mocks que éste, se metió lógica donde no va.
 *
 * Un canal sin respuesta configurada **rechaza con un error que lo nombra**,
 * en vez de devolver `undefined`. Un test que llama a un canal que no previó
 * tiene que fallar diciendo cuál, no romperse tres líneas después.
 *
 * Los eventos no se configuran acá: se disparan cuando el test quiere, con
 * [`emitFakeEvent`](#emitFakeEvent). Un evento es algo que pasa en un momento,
 * y fijarlo de antemano perdería justamente lo que hay que testear —qué hace
 * la UI cuando llega, y si se desuscribe al desmontarse—.
 *
 * @param responses Respuestas por canal.
 * @returns El espía de `invoke`, para verificar con qué se lo llamó.
 * @example
 * const invoke = installFakeApi({ 'fs:readDirectory': { ok: true, value: { entries: [] } } });
 * expect(invoke).toHaveBeenCalledWith('fs:readDirectory', { path: 'C:\\p' });
 */
export function installFakeApi(responses: FakeResponses) {
  const invoke = vi.fn((channel: ChannelName, _payload: unknown): Promise<unknown> => {
    const configured = responses[channel];

    if (configured === undefined) {
      return Promise.reject(new Error(`El test no configuró una respuesta para "${channel}"`));
    }

    return Promise.resolve(configured);
  });

  // Las suscripciones son estado vivo, no configuración: se tiran acá para que
  // un componente de un test anterior no siga escuchando en el siguiente.
  listeners = new Map();

  const subscribe = vi.fn(
    (event: EventName, listener: (payload: never) => void): (() => void) => {
      const forEvent = listeners.get(event) ?? new Set();

      forEvent.add(listener);
      listeners.set(event, forEvent);

      return () => {
        forEvent.delete(listener);
      };
    }
  );

  // `window.pastecode` está declarado readonly porque en la app lo instala el
  // contextBridge y nadie más debería tocarlo. En un test hay que instalarlo,
  // y `defineProperty` es la forma de hacerlo sin mentir sobre el tipo.
  Object.defineProperty(window, 'pastecode', {
    value: { invoke, subscribe },
    configurable: true,
    writable: true,
  });

  return invoke;
}

/**
 * Dispara un evento hacia quien se haya suscripto con el api falso.
 *
 * **Lanza si nadie está escuchando.** Es la mitad del valor de la función: un
 * test que emite `terminal:data` y no ve nada en pantalla tiene dos causas
 * posibles —el componente no se suscribió, o se suscribió y no pintó—, y sin
 * este error hay que salir a buscar cuál de las dos fue. También es lo que
 * convierte "se desuscribe al desmontarse" en un test de una línea.
 *
 * @param event Evento del contrato.
 * @param payload Payload, con el tipo que le corresponde al evento.
 * @example
 * emitFakeEvent('terminal:data', { sessionId: 'a', chunk: 'hola' });
 */
export function emitFakeEvent<E extends EventName>(event: E, payload: EventPayload<E>): void {
  const forEvent = listeners.get(event);

  if (forEvent === undefined || forEvent.size === 0) {
    throw new Error(`Nadie está suscripto a "${event}"`);
  }

  // Se copia antes de recorrer: un listener puede desuscribirse mientras
  // atiende, y mutar el Set durante su propio `for` es un bug difícil de ver.
  for (const listener of [...forEvent]) {
    // El mapa guarda listeners de eventos distintos, así que su tipo tiene que
    // ser el que los acepta a todos. Despachar desde ahí necesita una
    // aserción; es el mismo límite —y la misma justificación— que la del
    // preload de verdad, sólo que acá el emisor es el test.
    // eslint-disable-next-line no-restricted-syntax
    (listener as (payload: EventPayload<E>) => void)(payload);
  }
}
