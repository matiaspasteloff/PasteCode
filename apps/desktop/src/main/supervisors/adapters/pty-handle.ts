import type { IPty } from '@lydell/node-pty';

import type { ProcessHandle } from '../process-handle.js';

/**
 * Un PTY vivo, con lo que hace falta para hablarle.
 *
 * `write` y `resize` no están en `ProcessHandle` porque son exactamente lo que
 * distingue a una pseudo-terminal de cualquier otro proceso hijo: no hay nada
 * que redimensionar en un servidor de lenguaje.
 */
export interface PtyHandle extends ProcessHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /**
   * La salida, tal cual la escribió el proceso.
   *
   * Un PTY mezcla salida, eco y secuencias de control en un solo canal, así que
   * es un callback de strings y no un `Readable`: no hay dos streams que
   * separar. Es exactamente la diferencia con `ChildProcessHandle`.
   */
  onData(listener: (chunk: string) => void): void;
}

/**
 * Envuelve un PTY como handle del supervisor.
 *
 * @param pty El PTY recién lanzado.
 * @returns El handle.
 * @example
 * const handle = adaptPty(spawn(shell.file, [...shell.args], options));
 * handle.write('ls\r');
 */
export function adaptPty(pty: IPty): PtyHandle {
  return {
    pid: pty.pid,

    write(data) {
      pty.write(data);
    },

    resize(cols, rows) {
      pty.resize(cols, rows);
    },

    terminate() {
      terminate(pty);
    },

    forceKill() {
      forceKill(pty);
    },

    onData(listener) {
      pty.onData(listener);
    },

    onExit(listener) {
      pty.onExit(({ exitCode, signal }) => {
        listener({ exitCode, signal: signal ?? null });
      });
    },
  };
}

/**
 * Le pide al proceso que termine.
 *
 * En Windows `kill` **lanza** si se le pasa una señal, porque conpty no las
 * tiene: ahí `kill()` sin argumentos termina la consola entera, que es el
 * equivalente. Es la razón por la que la redacción de RNF-10 —`SIGTERM` y
 * después `SIGKILL`— describe sólo la mitad POSIX del comportamiento.
 */
function terminate(pty: IPty): void {
  if (process.platform === 'win32') {
    pty.kill();
    return;
  }

  pty.kill('SIGTERM');
}

/** Mata sin preguntar. En Windows es lo mismo que pedir: no hay escalación. */
function forceKill(pty: IPty): void {
  if (process.platform === 'win32') {
    pty.kill();
    return;
  }

  pty.kill('SIGKILL');
}
