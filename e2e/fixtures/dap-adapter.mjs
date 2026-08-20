/**
 * Un adaptador DAP de prueba, para el E2E de la sesión de debug.
 *
 * **No es un mock**: es un proceso de verdad que habla el protocolo por stdio,
 * igual que el `fake-adapter.mjs` de los unitarios y por la misma razón. La
 * diferencia es el alcance: éste simula una **sesión completa** —arranca, frena
 * en un breakpoint, tiene un stack con variables, evalúa expresiones y
 * termina— para que el E2E pueda recorrer RF-503, RF-504 y RF-505 sin depender
 * de que haya un `vscode-js-debug` instalado en la máquina.
 *
 * Simular el adaptador y no el IDE es lo correcto: lo que el test verifica es
 * **nuestro** lado del protocolo.
 */

let pending = Buffer.alloc(0);
let seq = 1;

/** Dónde dice frenar. Lo llena el `setBreakpoints` que llegue. */
let stopLine = 2;

function write(message) {
  const body = JSON.stringify({ seq: seq++, ...message });

  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function respond(request, body) {
  write({
    type: 'response',
    request_seq: request.seq,
    command: request.command,
    success: true,
    ...(body === undefined ? {} : { body }),
  });
}

/** Lo que contesta cada comando del protocolo. */
const HANDLERS = {
  initialize(request) {
    respond(request, { supportsConfigurationDoneRequest: true });
    write({ type: 'event', event: 'initialized' });
  },

  launch(request) {
    respond(request);
  },

  setBreakpoints(request) {
    const lines = request.arguments?.breakpoints ?? [];

    if (lines.length > 0) stopLine = lines[0].line;

    respond(request, { breakpoints: lines.map((b) => ({ verified: true, line: b.line })) });
  },

  configurationDone(request) {
    respond(request);

    // El programa "corre" y frena en el breakpoint. El output va antes, que es
    // el orden real: algo se imprime y después se llega a la línea marcada.
    write({
      type: 'event',
      event: 'output',
      body: { category: 'stdout', output: 'arrancando\n' },
    });
    write({
      type: 'event',
      event: 'stopped',
      body: { reason: 'breakpoint', threadId: 1, allThreadsStopped: true },
    });
  },

  stackTrace(request) {
    respond(request, {
      stackFrames: [
        { id: 1000, name: 'sumar', line: stopLine, column: 1, source: { path: 'app.js' } },
        { id: 1001, name: 'principal', line: 1, column: 1, source: { path: 'app.js' } },
      ],
      totalFrames: 2,
    });
  },

  scopes(request) {
    respond(request, {
      scopes: [{ name: 'Local', variablesReference: 2000, expensive: false }],
    });
  },

  variables(request) {
    if (request.arguments?.variablesReference === 2000) {
      respond(request, {
        variables: [
          { name: 'a', value: '1', variablesReference: 0 },
          { name: 'objeto', value: 'Object', variablesReference: 2001 },
        ],
      });

      return;
    }

    respond(request, {
      variables: [{ name: 'adentro', value: '"hola"', variablesReference: 0 }],
    });
  },

  evaluate(request) {
    const expression = request.arguments?.expression ?? '';

    if (expression === 'a + 1') {
      respond(request, { result: '2', variablesReference: 0 });
      return;
    }

    write({
      type: 'response',
      request_seq: request.seq,
      command: request.command,
      success: false,
      message: `No se pudo evaluar "${expression}"`,
    });
  },

  continue(request) {
    respond(request, { allThreadsContinued: true });
    write({ type: 'event', event: 'output', body: { category: 'stdout', output: 'listo\n' } });
    write({ type: 'event', event: 'terminated', body: {} });
  },

  next(request) {
    respond(request);
    write({ type: 'event', event: 'stopped', body: { reason: 'step', threadId: 1 } });
  },

  disconnect(request) {
    respond(request);
    setImmediate(() => process.exit(0));
  },
};

function handle(request) {
  const handler = HANDLERS[request.command];

  if (handler === undefined) {
    respond(request);
    return;
  }

  handler(request);
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

process.stdin.resume();
