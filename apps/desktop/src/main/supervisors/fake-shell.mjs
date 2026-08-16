/**
 * Shell falso para los tests del supervisor de PTY.
 *
 * Es un binario de verdad —Node ejecutando este archivo— y no un mock: lo que
 * hay que verificar es que un proceso hijo real reciba lo que se le escribe,
 * respete el cwd y muera cuando se lo mata. Un doble de `node-pty` verificaría
 * que llamamos bien a una librería, que es justo lo que no falla nunca.
 *
 * Protocolo, todo terminado en CRLF porque del otro lado hay un PTY:
 *
 * - Al arrancar anuncia `CWD:<directorio>` y `ELECTRON_RUN_AS_NODE:<valor>`.
 * - Por cada línea que recibe responde `echo:<línea>`.
 * - `exit <n>` lo hace salir con ese código.
 * - `spin` lo deja vivo sin responder, para probar la limpieza al cerrar.
 */
process.stdout.write(`CWD:${process.cwd()}\r\n`);
const inherited = process.env.ELECTRON_RUN_AS_NODE ?? 'unset';

process.stdout.write(`ELECTRON_RUN_AS_NODE:${inherited}\r\n`);

process.stdin.setEncoding('utf8');

let pending = '';

process.stdin.on('data', (chunk) => {
  pending += chunk;

  // conpty manda el Enter como `\r`; un shell en Unix puede mandar `\n`.
  const lines = pending.split(/\r\n|\r|\n/);
  pending = lines.pop() ?? '';

  for (const line of lines) {
    if (line.startsWith('exit ')) {
      process.exit(Number.parseInt(line.slice('exit '.length), 10));
    }

    if (line === 'spin') continue;

    process.stdout.write(`echo:${line}\r\n`);
  }
});

// Sin esto el proceso saldría apenas termine de leer el script.
process.stdin.resume();
