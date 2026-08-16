import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

import type { ProcessExit, ProcessHandle } from '../process-handle.js';

/**
 * Un proceso hijo con pipes, para el supervisor.
 *
 * Agrega los dos streams a la interfaz mínima porque un servidor de lenguaje se
 * usa exactamente así: `vscode-jsonrpc` quiere un `Readable` y un `Writable`, y
 * no hay forma de darle eso desde un PTY —una pseudo-terminal mezcla salida y
 * eco en un solo canal y le mete secuencias de control—. La diferencia es real,
 * así que vive en el tipo en vez de esconderse detrás de un campo opcional que
 * la mitad de los usos tendría que verificar.
 */
export interface ChildProcessHandle extends ProcessHandle {
  readonly stdin: Writable;
  readonly stdout: Readable;
}

/**
 * Envuelve un `child_process` como handle del supervisor.
 *
 * @param child El hijo recién lanzado.
 * @returns El handle, con sus dos streams.
 * @example
 * const handle = adaptChildProcess(spawn(file, args, { shell: false }));
 * handle.terminate();
 */
export function adaptChildProcess(child: ChildProcessWithoutNullStreams): ChildProcessHandle {
  return {
    // Un hijo cuyo spawn falló no tiene pid. `-1` es un valor que ningún SO
    // asigna, así que aparece en el log como lo que es en vez de como un 0
    // que se puede confundir con un proceso real.
    pid: child.pid ?? -1,
    stdin: child.stdin,
    stdout: child.stdout,

    terminate() {
      // En Windows la señal se ignora y Node llama a `TerminateProcess`: no hay
      // pedido amable posible. Es la misma mitad-POSIX que documenta `pty.ts`,
      // y la razón por la que el apagado por protocolo de `ManagedProcess`
      // existe: para los procesos que sí saben apagarse solos, esta llamada es
      // el último recurso y no el primero.
      child.kill('SIGTERM');
    },

    forceKill() {
      child.kill('SIGKILL');
    },

    onExit(listener) {
      let notified = false;

      const notify = (exit: ProcessExit): void => {
        if (notified) return;

        notified = true;
        listener(exit);
      };

      // Los dos, y con guarda: si el spawn falla, Node emite `error` y puede no
      // emitir `close`; si arranca bien, emite `close` y no `error`. Escuchar
      // uno solo deja colgado para siempre al otro caso.
      child.on('error', () => {
        notify({ exitCode: -1, signal: null });
      });

      child.on('close', (code, signal) => {
        notify({ exitCode: code ?? -1, signal: signalNumber(signal) });
      });
    },
  };
}

/**
 * Traduce el nombre de señal de Node al número que publica el contrato.
 *
 * `terminal:exit` ya define `signal` como número —es lo que devuelve node-pty—,
 * y tener dos representaciones de lo mismo según de dónde venga el proceso es
 * exactamente el tipo de detalle que después nadie recuerda. Sólo se traducen
 * las dos que este código manda; cualquier otra vale más como `null` que como
 * un número inventado.
 */
function signalNumber(signal: NodeJS.Signals | null): number | null {
  if (signal === 'SIGTERM') return 15;
  if (signal === 'SIGKILL') return 9;

  return null;
}
