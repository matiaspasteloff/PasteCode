import type { DebugProtocol } from '@vscode/debugprotocol';

/**
 * El separador entre la cabecera y el cuerpo. Dos saltos de línea estilo HTTP.
 *
 * DAP usa **el mismo encuadre que LSP**: `Content-Length: N\r\n\r\n` seguido del
 * JSON. No es casualidad —los dos protocolos salieron del mismo equipo— y es lo
 * que hace que este archivo se parezca tanto a lo que `vscode-jsonrpc` hace por
 * nosotros del lado del LSP.
 */
const HEADER_SEPARATOR = '\r\n\r\n';

/** La única cabecera que importa. El resto, si viene, se ignora. */
const CONTENT_LENGTH = /content-length:\s*(\d+)/i;

/**
 * Arma el mensaje listo para escribir en el stream del adaptador.
 *
 * **`Buffer.byteLength` y no `.length`.** `Content-Length` se mide en bytes y no
 * en caracteres: un nombre de variable con acentos, o un `output` con emojis,
 * ocupa más bytes que caracteres en UTF-8. Contar caracteres deja al adaptador
 * esperando bytes que nunca llegan, y el síntoma es un debugger que se cuelga
 * recién cuando alguien pone una ñ en un `console.log`.
 *
 * @param message El mensaje del protocolo, sin encuadrar.
 * @returns El buffer con cabecera y cuerpo.
 * @example
 * stream.write(encodeMessage({ seq: 1, type: 'request', command: 'initialize' }));
 */
export function encodeMessage(message: DebugProtocol.ProtocolMessage): Buffer {
  const body = JSON.stringify(message);

  return Buffer.from(
    `Content-Length: ${String(Buffer.byteLength(body, 'utf8'))}${HEADER_SEPARATOR}${body}`,
    'utf8'
  );
}

/** Va juntando bytes y entrega mensajes completos. */
export interface MessageDecoder {
  /**
   * Le entrega un pedazo del stream y devuelve lo que haya quedado completo.
   *
   * @param chunk Lo que llegó del adaptador. Puede ser medio mensaje, o tres.
   * @returns Los mensajes completos, en orden.
   */
  push(chunk: Buffer): DebugProtocol.ProtocolMessage[];
}

/**
 * Crea el decodificador del stream de un adaptador.
 *
 * **Un chunk no es un mensaje.** Lo que llega por un pipe se parte donde el
 * sistema operativo quiere: un `stopped` puede llegar en dos pedazos, y dos
 * eventos pueden llegar pegados en uno. Asumir que cada `data` es un mensaje
 * anda en desarrollo con mensajes chicos y se rompe con el primer `variables`
 * de un objeto grande, que es exactamente el momento en que nadie sospecha del
 * transporte.
 *
 * Un mensaje que no es JSON válido **se descarta y no corta el stream**: del
 * otro lado hay un ejecutable que no controlamos, y una línea de basura no
 * puede dejar la sesión de debug muda para siempre.
 *
 * @returns El decodificador, con su buffer vacío.
 * @example
 * const decoder = createMessageDecoder();
 * child.stdout.on('data', (chunk) => decoder.push(chunk).forEach(handle));
 */
export function createMessageDecoder(): MessageDecoder {
  // La anotación no es ruido: sin ella el tipo se infiere de `Buffer.alloc`,
  // que devuelve el `Buffer` más angosto, y la primera concatenación no asigna.
  let pending: Buffer = Buffer.alloc(0);

  return {
    push(chunk) {
      pending = Buffer.concat([pending, chunk]);

      const messages: DebugProtocol.ProtocolMessage[] = [];

      for (;;) {
        const next = takeMessage(pending);

        if (next === null) break;

        pending = next.rest;

        if (next.message !== null) messages.push(next.message);
      }

      return messages;
    },
  };
}

/** Un mensaje completo sacado del buffer, con lo que quedó atrás. */
interface Taken {
  /** `null` si el cuerpo no era JSON: se consumió igual para no trabarse. */
  message: DebugProtocol.ProtocolMessage | null;
  rest: Buffer;
}

/** Saca el primer mensaje completo del buffer, o `null` si todavía no hay uno. */
function takeMessage(buffer: Buffer): Taken | null {
  const separator = buffer.indexOf(HEADER_SEPARATOR);

  if (separator === -1) return null;

  const header = buffer.subarray(0, separator).toString('utf8');
  const match = CONTENT_LENGTH.exec(header);

  // Una cabecera sin `Content-Length` es basura: se descarta hasta el separador
  // y se sigue. Cortar acá dejaría el stream trabado para siempre por un
  // adaptador que escupió una línea de más.
  if (match?.[1] === undefined) {
    return { message: null, rest: buffer.subarray(separator + HEADER_SEPARATOR.length) };
  }

  const length = Number(match[1]);
  const start = separator + HEADER_SEPARATOR.length;

  // Todavía no llegó el cuerpo entero: se espera al próximo chunk.
  if (buffer.length < start + length) return null;

  const body = buffer.subarray(start, start + length).toString('utf8');
  const rest = buffer.subarray(start + length);

  return { message: parseMessage(body), rest };
}

/** Interpreta el cuerpo, o `null` si no es un mensaje del protocolo. */
function parseMessage(body: string): DebugProtocol.ProtocolMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const seq: unknown = Reflect.get(parsed, 'seq');
  const type: unknown = Reflect.get(parsed, 'type');

  if (typeof seq !== 'number') return null;
  if (type !== 'request' && type !== 'response' && type !== 'event') return null;

  return { ...parsed, seq, type };
}
