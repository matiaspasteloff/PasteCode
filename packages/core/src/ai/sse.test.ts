import { describe, expect, it } from 'vitest';

import { consumeSse } from './sse.js';

describe('consumeSse', () => {
  it('devuelve el payload de un evento completo, sin el prefijo', () => {
    const result = consumeSse('', 'data: {"a":1}\n\n');

    expect(result.events).toEqual(['{"a":1}']);
    expect(result.rest).toBe('');
    expect(result.isDone).toBe(false);
  });

  it('deja lo incompleto en el resto en vez de tirarlo', () => {
    const result = consumeSse('', 'data: {"a":1}\n\ndata: {"b":');

    expect(result.events).toEqual(['{"a":1}']);
    expect(result.rest).toBe('data: {"b":');
  });

  it('recompone un JSON partido entre dos chunks', () => {
    // Es el caso normal y no el raro: un chunk de red no coincide con un
    // evento. Sin el resto, este payload se perdería entero.
    const first = consumeSse('', 'data: {"choices":[{"delta"');
    const second = consumeSse(first.rest, ':{"content":"hola"}}]}\n\n');

    expect(first.events).toEqual([]);
    expect(second.events).toEqual(['{"choices":[{"delta":{"content":"hola"}}]}']);
  });

  it('lee varios eventos de un solo chunk', () => {
    const result = consumeSse('', 'data: 1\n\ndata: 2\n\ndata: 3\n\n');

    expect(result.events).toEqual(['1', '2', '3']);
  });

  it('reconoce el centinela [DONE] y no lo devuelve como evento', () => {
    const result = consumeSse('', 'data: {"a":1}\n\ndata: [DONE]\n\n');

    expect(result.events).toEqual(['{"a":1}']);
    expect(result.isDone).toBe(true);
  });

  it('ignora los comentarios de keep-alive y los campos que no son data', () => {
    const result = consumeSse('', ': ping\n\nevent: message\ndata: {"a":1}\nid: 7\n\n');

    expect(result.events).toEqual(['{"a":1}']);
  });

  it('normaliza CRLF antes de partir', () => {
    // Sin esto queda un \r colgado al final del payload y el JSON.parse de
    // aguas abajo falla contra un servidor que usa CRLF.
    const result = consumeSse('', 'data: {"a":1}\r\n\r\n');

    expect(result.events).toEqual(['{"a":1}']);
  });

  it('junta las líneas data: de un mismo bloque con un salto', () => {
    const result = consumeSse('', 'data: primera\ndata: segunda\n\n');

    expect(result.events).toEqual(['primera\nsegunda']);
  });

  it('no consume nada cuando el chunk no cierra ningún evento', () => {
    const result = consumeSse('', 'data: parcial');

    expect(result.events).toEqual([]);
    expect(result.rest).toBe('data: parcial');
  });

  it('acepta el payload sin el espacio después de los dos puntos', () => {
    const result = consumeSse('', 'data:{"a":1}\n\n');

    expect(result.events).toEqual(['{"a":1}']);
  });
});
