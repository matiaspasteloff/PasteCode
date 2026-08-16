import type { IPty } from '@lydell/node-pty';
import { spawn } from '@lydell/node-pty';
import type { TerminalDimensions } from '@pastecode/core';
import {
  clampDimensions,
  displayNameFor,
  nextSessionId,
  TerminalSpawnError,
  UnknownTerminalSessionError,
} from '@pastecode/core';
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSession,
} from '@pastecode/ipc-contract';

import type { ShellCommand } from '../services/shell.js';
import { sanitizedEnvironment } from '../services/shell.js';

/**
 * Lo que se le espera a un proceso para que muera solo antes de matarlo.
 *
 * Son los 3 segundos textuales de
 * [RNF-10](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
 */
const GRACE_PERIOD_MS = 3000;

/** Configuración de un supervisor. Todo se inyecta: no lee nada global. */
export interface PtySupervisorConfig {
  /** Shell a lanzar. En los tests, un binario falso. */
  readonly shell: ShellCommand;
  /** Directorio de trabajo de toda sesión. La raíz del workspace (RF-301). */
  readonly cwd: string;
  readonly onData: (event: TerminalDataEvent) => void;
  readonly onExit: (event: TerminalExitEvent) => void;
}

/** Un supervisor de sesiones de PTY. */
export interface PtySupervisor {
  create(dimensions: TerminalDimensions): TerminalSession;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, dimensions: TerminalDimensions): void;
  dispose(sessionId: string): void;
  list(): TerminalSession[];
  disposeAll(): Promise<void>;
}

/** Una sesión viva: lo que ve el renderer más el PTY que hay detrás. */
interface LiveSession {
  readonly info: TerminalSession;
  readonly pty: IPty;
}

/**
 * Crea el supervisor de terminales.
 *
 * Es una fábrica y no un módulo con estado porque el paso 26 va a extraer de
 * acá el supervisor genérico que reusan el LSP y el DAP. La separación que ese
 * paso necesita —"supervisar un proceso" contra "esto es un PTY"— sólo se
 * sostiene si el ciclo de vida es un objeto que se puede tener por duplicado.
 * Además es lo que deja tener uno por test sin resetear nada global.
 *
 * Nada de acá conoce Electron: los eventos salen por `onData` y `onExit`, y
 * quien los conecta con `emit` es la capa de IPC. Es lo que permite testear el
 * supervisor con un proceso de verdad y sin una app viva, que es lo que pide
 * [testing.md](../../../../../docs/convenciones/testing.md#integración).
 *
 * @param config Shell, cwd y los dos callbacks de salida.
 * @returns El supervisor.
 * @example
 * const pty = createPtySupervisor({ shell: defaultShell(), cwd: root, onData, onExit });
 * const session = pty.create({ cols: 80, rows: 24 });
 */
export function createPtySupervisor(config: PtySupervisorConfig): PtySupervisor {
  const sessions = new Map<string, LiveSession>();

  function requireSession(sessionId: string): LiveSession {
    const session = sessions.get(sessionId);

    if (session === undefined) throw new UnknownTerminalSessionError(sessionId);

    return session;
  }

  return {
    create(dimensions) {
      return openSession(config, sessions, dimensions);
    },

    write(sessionId, data) {
      requireSession(sessionId).pty.write(data);
    },

    resize(sessionId, dimensions) {
      const { cols, rows } = clampDimensions(dimensions);

      requireSession(sessionId).pty.resize(cols, rows);
    },

    dispose(sessionId) {
      // No se saca del mapa acá: sale en `onExit`, que es el único momento en
      // que el proceso está muerto de verdad. Borrarlo antes dejaría un
      // proceso vivo que ya nadie puede matar, que es justo lo que RF-305
      // prohíbe.
      terminate(requireSession(sessionId).pty);
    },

    list() {
      return [...sessions.values()].map((session) => session.info);
    },

    async disposeAll() {
      // Dos fases, como pide RNF-10: primero se les pide que terminen, y a los
      // que siguen vivos después del período de gracia se los mata.
      const dying = [...sessions.values()];

      for (const session of dying) terminate(session.pty);

      await waitForExit(sessions, GRACE_PERIOD_MS);

      for (const session of sessions.values()) forceKill(session.pty);
    },
  };
}

/**
 * Lanza un PTY y lo deja registrado, escuchando su salida.
 *
 * Está afuera de la fábrica y recibe el mapa por parámetro sólo para que la
 * fábrica quepa de un vistazo; no tiene otra vida propia.
 *
 * @throws {TerminalSpawnError} Si el shell no se puede lanzar.
 */
function openSession(
  config: PtySupervisorConfig,
  sessions: Map<string, LiveSession>,
  dimensions: TerminalDimensions
): TerminalSession {
  const { cols, rows } = clampDimensions(dimensions);
  const sessionId = nextSessionId([...sessions.keys()]);
  const displayName = displayNameFor(
    config.shell.file,
    [...sessions.values()].map((session) => session.info.displayName)
  );

  let pty: IPty;

  try {
    pty = spawn(config.shell.file, [...config.shell.args], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: config.cwd,
      env: sanitizedEnvironment(process.env),
    });
  } catch (cause) {
    throw new TerminalSpawnError(config.shell.file, cause);
  }

  const info: TerminalSession = { sessionId, displayName, pid: pty.pid };

  sessions.set(sessionId, { info, pty });

  pty.onData((chunk) => {
    config.onData({ sessionId, chunk });
  });

  pty.onExit(({ exitCode, signal }) => {
    // Se saca del mapa **antes** de avisar: si el listener del renderer
    // reacciona pidiendo la lista de sesiones, la que acaba de morir no tiene
    // que aparecer.
    sessions.delete(sessionId);
    config.onExit({ sessionId, exitCode, signal: signal ?? null });
  });

  return info;
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

/**
 * Espera a que el mapa se vacíe, o a que se acabe el tiempo.
 *
 * Sondea en vez de contar los `onExit` porque el que vacía el mapa es el
 * propio `onExit` de cada sesión, y esperar a que ese callback corra es
 * exactamente lo que hace falta: si el mapa quedó vacío, node-pty ya vio morir
 * a todos los procesos.
 */
async function waitForExit(sessions: Map<string, unknown>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (sessions.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
