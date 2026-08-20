import type { DebugProtocol } from '@vscode/debugprotocol';
import { describe, expect, it } from 'vitest';

import { createMessageDecoder, encodeMessage } from './framing.js';

/** Un evento cualquiera, para no repetir el objeto en cada caso. */
function event(name: string, body?: Record<string, unknown>): DebugProtocol.Event {
  return { seq: 1, type: 'event', event: name, ...(body === undefined ? {} : { body }) };
}

describe('encodeMessage', () => {
  it('escribe la cabecera y el cuerpo separados por dos saltos', () => {
    const encoded = encodeMessage(event('initialized')).toString('utf8');

    expect(encoded).toMatch(/^Content-Length: \d+\r\n\r\n\{/);
  });

  it('mide el largo en bytes y no en caracteres', () => {
    // Es el bug que sólo aparece cuando alguien pone una ñ en un `console.log`:
    // en UTF-8 ocupa dos bytes, así que contar caracteres deja al adaptador
    // esperando un byte que nunca llega.
    const encoded = encodeMessage(event('output', { output: 'ñ' })).toString('utf8');
    const declared = Number(/Content-Length: (\d+)/.exec(encoded)?.[1]);
    const body = encoded.slice(encoded.indexOf('\r\n\r\n') + 4);

    expect(declared).toBe(Buffer.byteLength(body, 'utf8'));
    expect(declared).toBeGreaterThan(body.length);
  });
});

describe('createMessageDecoder', () => {
  it('entrega el mensaje cuando llega entero', () => {
    const decoder = createMessageDecoder();

    expect(decoder.push(encodeMessage(event('initialized')))).toEqual([
      { seq: 1, type: 'event', event: 'initialized' },
    ]);
  });

  it('junta un mensaje partido en dos chunks', () => {
    // Lo que llega por un pipe se parte donde el sistema operativo quiere.
    const decoder = createMessageDecoder();
    const whole = encodeMessage(event('stopped', { reason: 'breakpoint' }));
    const cut = Math.floor(whole.length / 2);

    expect(decoder.push(whole.subarray(0, cut))).toEqual([]);
    expect(decoder.push(whole.subarray(cut))).toHaveLength(1);
  });

  it('parte por la mitad de la cabecera y sigue entendiendo', () => {
    const decoder = createMessageDecoder();
    const whole = encodeMessage(event('initialized'));

    expect(decoder.push(whole.subarray(0, 8))).toEqual([]);
    expect(decoder.push(whole.subarray(8))).toHaveLength(1);
  });

  it('entrega los tres cuando llegan pegados en un chunk', () => {
    const decoder = createMessageDecoder();
    const glued = Buffer.concat([
      encodeMessage(event('uno')),
      encodeMessage(event('dos')),
      encodeMessage(event('tres')),
    ]);

    const nombres = decoder
      .push(glued)
      .map((message): unknown => Reflect.get(message, 'event'));

    expect(nombres).toEqual(['uno', 'dos', 'tres']);
  });

  it('respeta el largo declarado aunque el cuerpo tenga bytes multibyte', () => {
    const decoder = createMessageDecoder();
    const first = encodeMessage(event('output', { output: 'áéíóú 🙂' }));
    const second = encodeMessage(event('terminated'));

    const [uno, dos] = decoder.push(Buffer.concat([first, second]));

    // Si el largo se midiera en caracteres, el corte caería adentro del primer
    // cuerpo y el segundo mensaje jamás se reconocería.
    expect(Reflect.get(uno ?? {}, 'body')).toEqual({ output: 'áéíóú 🙂' });
    expect(Reflect.get(dos ?? {}, 'event')).toBe('terminated');
  });

  describe('lo que manda un ejecutable que no controlamos', () => {
    it('descarta un cuerpo que no es JSON sin trabar el stream', () => {
      const decoder = createMessageDecoder();
      const basura = Buffer.from('Content-Length: 5\r\n\r\nhola!', 'utf8');

      expect(decoder.push(basura)).toEqual([]);
      expect(decoder.push(encodeMessage(event('sigo-vivo')))).toHaveLength(1);
    });

    it('descarta una cabecera sin Content-Length y sigue', () => {
      const decoder = createMessageDecoder();

      expect(decoder.push(Buffer.from('Vaya cosa rara\r\n\r\n', 'utf8'))).toEqual([]);
      expect(decoder.push(encodeMessage(event('sigo-vivo')))).toHaveLength(1);
    });

    it('descarta un JSON que no tiene forma de mensaje del protocolo', () => {
      const decoder = createMessageDecoder();
      const body = JSON.stringify({ hola: 'mundo' });
      const raw = `Content-Length: ${String(Buffer.byteLength(body))}\r\n\r\n${body}`;

      expect(decoder.push(Buffer.from(raw, 'utf8'))).toEqual([]);
    });

    it('no se cuelga con un chunk vacío', () => {
      const decoder = createMessageDecoder();

      expect(decoder.push(Buffer.alloc(0))).toEqual([]);
    });
  });

  it('conserva el sobrante entre llamadas', () => {
    const decoder = createMessageDecoder();
    const first = encodeMessage(event('uno'));
    const second = encodeMessage(event('dos'));

    // El primer chunk trae un mensaje entero y la mitad del siguiente.
    const cut = Math.floor(second.length / 2);
    const entregados = decoder.push(Buffer.concat([first, second.subarray(0, cut)]));

    expect(entregados).toHaveLength(1);
    expect(decoder.push(second.subarray(cut))).toHaveLength(1);
  });
});
