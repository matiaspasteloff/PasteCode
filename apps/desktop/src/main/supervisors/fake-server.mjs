/**
 * Servidor falso para los tests del supervisor genérico y del cliente LSP.
 *
 * Hermano de `fake-shell.mjs` y con el mismo criterio: es un proceso de verdad
 * —Node ejecutando este archivo— y no un doble. Lo que hay que verificar es que
 * el supervisor reinicie procesos que se mueren, escale a `SIGKILL` a los que
 * ignoran el pedido de terminar y declare enfermo al que deja de contestar.
 * Ninguna de esas tres cosas se puede probar contra un mock, porque las tres
 * son sobre lo que hace el sistema operativo.
 *
 * Banderas, combinables:
 *
 * - `--lsp` habla LSP por stdio, con framing de `Content-Length`.
 * - `--exit-after=<ms>` sale con código 1 pasado ese tiempo. Ejercita el límite
 *   de tres intentos.
 * - `--ignore-term` instala un handler de `SIGTERM` que no hace nada. Es la
 *   única forma de ejercitar la escalada a force-kill.
 * - `--hang` responde `initialize` y después no contesta nada más. Ejercita el
 *   health check pasivo.
 * - `--position-encoding=<enc>` negocia ese encoding en vez de `utf-16`.
 *   Ejercita el rechazo de un servidor que no habla en unidades UTF-16.
 *
 * Sin `--lsp` es un proceso liso: anuncia `READY` y hace eco de cada línea.
 */

const args = process.argv.slice(2);

/** Lee el valor de una bandera con `=`. `undefined` si no está. */
function flagValue(name) {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));

  return found === undefined ? undefined : found.slice(prefix.length);
}

const isLsp = args.includes('--lsp');
const isHanging = args.includes('--hang');
const exitAfter = flagValue('exit-after');
const positionEncoding = flagValue('position-encoding') ?? 'utf-16';

if (args.includes('--ignore-term')) {
  // Un handler vacío es lo que convierte a SIGTERM en un no-op: sin él, la
  // acción por defecto mata el proceso y no habría nada que escalar.
  process.on('SIGTERM', () => undefined);
  process.on('SIGINT', () => undefined);
}

if (exitAfter !== undefined) {
  setTimeout(() => {
    process.exit(1);
  }, Number.parseInt(exitAfter, 10));
}

if (!isLsp) {
  runPlainProcess();
} else {
  runLanguageServer();
}

/** El modo liso: eco por líneas, como `fake-shell.mjs` pero sobre pipes. */
function runPlainProcess() {
  process.stdout.write('READY\n');
  process.stdin.setEncoding('utf8');

  let pending = '';

  process.stdin.on('data', (chunk) => {
    pending += chunk;

    const lines = pending.split('\n');
    pending = lines.pop() ?? '';

    for (const line of lines) process.stdout.write(`echo:${line}\n`);
  });

  process.stdin.resume();
}

/** El modo LSP: lee mensajes con framing y responde lo mínimo del protocolo. */
function runLanguageServer() {
  process.stdin.on('data', (chunk) => {
    receive(chunk);
  });
  process.stdin.resume();
}

let buffer = Buffer.alloc(0);

/**
 * Acumula bytes y saca de ahí todos los mensajes completos que haya.
 *
 * El framing se implementa a mano acá **a propósito**, aunque el cliente de
 * producción use `vscode-jsonrpc`: un test que usara la misma librería de los
 * dos lados no probaría el framing, probaría que la librería se entiende con
 * ella misma.
 */
function receive(chunk) {
  buffer = Buffer.concat([buffer, chunk]);

  for (;;) {
    const separator = buffer.indexOf('\r\n\r\n');

    if (separator === -1) return;

    const header = buffer.subarray(0, separator).toString('ascii');
    const length = Number.parseInt(/content-length: *(\d+)/i.exec(header)?.[1] ?? '', 10);

    if (Number.isNaN(length)) return;

    const start = separator + 4;

    if (buffer.length < start + length) return;

    const body = buffer.subarray(start, start + length).toString('utf8');
    buffer = buffer.subarray(start + length);

    handle(JSON.parse(body));
  }
}

/** Escribe un mensaje con su framing. */
function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');

  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

/** Responde un request, o reacciona a una notificación. */
function handle(message) {
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: initializeResult() });
    return;
  }

  // Todo lo demás pasa por acá: colgado significa colgado, incluido `shutdown`.
  if (isHanging) return;

  if (message.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: message.id, result: null });
    return;
  }

  if (message.method === 'exit') {
    process.exit(0);
  }

  if (message.method === 'textDocument/didOpen') {
    publishDiagnostics(message.params.textDocument);
    return;
  }

  if (message.method === 'textDocument/didChange') {
    // Los cambios llegan incrementales; el falso no mantiene el texto, así que
    // republica sobre la versión nueva para que el renderer vea que llegó.
    publishDiagnostics(message.params.textDocument);
    return;
  }

  if (message.id !== undefined) {
    send({ jsonrpc: '2.0', id: message.id, result: resultFor(message.method) });
  }
}

/** Las capabilities que anuncia. `textDocumentSync: 2` es incremental. */
function initializeResult() {
  return {
    capabilities: {
      positionEncoding,
      textDocumentSync: 2,
      completionProvider: { resolveProvider: true, triggerCharacters: ['.'] },
      hoverProvider: true,
      definitionProvider: true,
    },
    serverInfo: { name: 'fake-server', version: '1.0.0' },
  };
}

/**
 * Publica un diagnóstico si el documento lo pide.
 *
 * La regla es tonta y determinista a propósito: un error en la primera línea
 * por cada aparición de `BOOM` en el texto. Un servidor falso que analizara de
 * verdad tendría bugs propios, y lo que el test verifica es el transporte.
 */
function publishDiagnostics(textDocument) {
  const occurrences = (textDocument.text ?? '').split('BOOM').length - 1;

  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: {
      uri: textDocument.uri,
      version: textDocument.version,
      diagnostics: Array.from({ length: occurrences }, (_unused, index) => ({
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: 4 },
        },
        severity: 1,
        source: 'fake-server',
        message: `BOOM ${index + 1}`,
      })),
    },
  });
}

/** La respuesta de cada request que no es del ciclo de vida. */
function resultFor(method) {
  if (method === 'textDocument/completion') {
    return {
      isIncomplete: false,
      items: [
        { label: 'fakeSymbol', kind: 6, detail: 'del servidor falso' },
        { label: 'otherSymbol', kind: 3 },
      ],
    };
  }

  if (method === 'completionItem/resolve') {
    return { label: 'fakeSymbol', kind: 6, documentation: 'documentación resuelta' };
  }

  if (method === 'textDocument/hover') {
    return { contents: { kind: 'markdown', value: '**hover** del servidor falso' } };
  }

  if (method === 'textDocument/definition') {
    return {
      uri: 'file:///fake/definition.ts',
      range: { start: { line: 4, character: 2 }, end: { line: 4, character: 8 } },
    };
  }

  return null;
}
