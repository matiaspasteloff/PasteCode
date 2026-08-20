/**
 * Un adaptador DAP de mentira, para los tests del cliente.
 *
 * No es un mock: es un **proceso de verdad** que habla el protocolo por stdio,
 * igual que el `fake-server.mjs` del supervisor y por la misma razón. Lo que se
 * quiere verificar es el transporte —el encuadre, la correlación por `seq`, el
 * timeout, la muerte del proceso—, y un doble en memoria no ejerce nada de eso.
 *
 * Entiende cuatro comandos:
 * - `initialize` → contesta con capacidades mínimas y emite `initialized`.
 * - `eco` → devuelve los argumentos tal cual, para verificar la correlación.
 * - `lento` → no contesta nunca, para verificar el timeout.
 * - `feo` → contesta `success: false`, para verificar el rechazo.
 * - `morite` → sale con código 1 sin contestar, para verificar la muerte.
 */

/** Lo que va llegando y todavía no forma un mensaje entero. */
let pending = Buffer.alloc(0);

/** El `seq` del próximo mensaje que emitimos. */
let seq = 1;

/** Escribe un mensaje con el encuadre del protocolo. */
function write(message) {
  const body = JSON.stringify({ seq: seq++, ...message });

  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

/** Contesta un request. */
function respond(request, extra) {
  write({
    type: 'response',
    request_seq: request.seq,
    command: request.command,
    success: true,
    ...extra,
  });
}

/** Atiende un request ya decodificado. */
function handle(request) {
  if (request.command === 'initialize') {
    respond(request, { body: { supportsConfigurationDoneRequest: true } });
    write({ type: 'event', event: 'initialized' });
    return;
  }

  if (request.command === 'eco') {
    respond(request, { body: request.arguments ?? null });
    return;
  }

  if (request.command === 'feo') {
    write({
      type: 'response',
      request_seq: request.seq,
      command: request.command,
      success: false,
      message: 'no quiero',
    });
    return;
  }

  if (request.command === 'morite') {
    process.exit(1);
  }

  // `lento` y cualquier otro: silencio deliberado.
}

process.stdin.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);

  for (;;) {
    const separator = pending.indexOf('\r\n\r\n');

    if (separator === -1) return;

    const header = pending.subarray(0, separator).toString('utf8');
    const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1] ?? -1);

    if (length < 0) {
      pending = pending.subarray(separator + 4);
      continue;
    }

    const start = separator + 4;

    if (pending.length < start + length) return;

    const body = pending.subarray(start, start + length).toString('utf8');

    pending = pending.subarray(start + length);
    handle(JSON.parse(body));
  }
});

// Sin esto el proceso sale apenas termina de evaluar el módulo: `stdin` en modo
// flowing lo mantiene vivo, pero recién después del primer `data`.
process.stdin.resume();
