import type { ChannelName, IpcResult, Response } from '@pastecode/ipc-contract';
import { vi } from 'vitest';

/** Respuestas por canal. Lo que no esté acá falla con un error explícito. */
export type FakeResponses = {
  [C in ChannelName]?: IpcResult<Response<C>>;
};

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

  // `window.pastecode` está declarado readonly porque en la app lo instala el
  // contextBridge y nadie más debería tocarlo. En un test hay que instalarlo,
  // y `defineProperty` es la forma de hacerlo sin mentir sobre el tipo.
  Object.defineProperty(window, 'pastecode', {
    value: { invoke },
    configurable: true,
    writable: true,
  });

  return invoke;
}
