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

import type { PtyHandle } from './adapters/pty-handle.js';
import { adaptPty } from './adapters/pty-handle.js';
import type { ProcessPool } from './process-pool.js';
import { createProcessPool } from './process-pool.js';

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

/**
 * Crea el supervisor de terminales.
 *
 * Desde el paso 26 esto es una capa fina sobre `ProcessPool`: lo que queda acá
 * es lo que es específico de una terminal —el id y el nombre para mostrar, las
 * dimensiones, el entorno saneado— y nada del ciclo de vida, que ahora es
 * compartido con el LSP y con el DAP. La prueba de que el reparto quedó bien es
 * que [pty.test.ts](./pty.test.ts) sigue pasando sin tocar una línea.
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
  const pool = createProcessPool<string, PtyHandle>();
  // El pool tiene los procesos; esto tiene lo que ve el renderer. Son dos cosas
  // distintas y por eso son dos mapas: el pool no sabe qué es un `displayName`.
  const sessions = new Map<string, TerminalSession>();

  function requireHandle(sessionId: string): PtyHandle {
    const handle = pool.get(sessionId);

    if (handle === undefined) throw new UnknownTerminalSessionError(sessionId);

    return handle;
  }

  return {
    create(dimensions) {
      return openSession(config, pool, sessions, dimensions);
    },

    write(sessionId, data) {
      requireHandle(sessionId).write(data);
    },

    resize(sessionId, dimensions) {
      const { cols, rows } = clampDimensions(dimensions);

      requireHandle(sessionId).resize(cols, rows);
    },

    dispose(sessionId) {
      requireHandle(sessionId);
      pool.remove(sessionId);
    },

    list() {
      return [...sessions.values()];
    },

    async disposeAll() {
      await pool.disposeAll(GRACE_PERIOD_MS);
    },
  };
}

/**
 * Lanza un PTY y lo deja registrado, escuchando su salida.
 *
 * Está afuera de la fábrica y recibe los dos mapas por parámetro sólo para que
 * la fábrica quepa de un vistazo; no tiene otra vida propia.
 *
 * @throws {TerminalSpawnError} Si el shell no se puede lanzar.
 */
function openSession(
  config: PtySupervisorConfig,
  pool: ProcessPool<string, PtyHandle>,
  sessions: Map<string, TerminalSession>,
  dimensions: TerminalDimensions
): TerminalSession {
  const { cols, rows } = clampDimensions(dimensions);
  const sessionId = nextSessionId([...sessions.keys()]);
  const displayName = displayNameFor(
    config.shell.file,
    [...sessions.values()].map((session) => session.displayName)
  );

  const handle = pool.add(sessionId, {
    name: displayName,
    spawn: () => spawnPty(config, cols, rows),
    onExit: ({ exitCode, signal }) => {
      sessions.delete(sessionId);
      config.onExit({ sessionId, exitCode, signal });
    },
  });

  const info: TerminalSession = { sessionId, displayName, pid: handle.pid };

  sessions.set(sessionId, info);

  handle.onData((chunk) => {
    config.onData({ sessionId, chunk });
  });

  return info;
}

/**
 * Lanza el PTY propiamente dicho.
 *
 * @throws {TerminalSpawnError} Si el shell no se puede lanzar.
 */
function spawnPty(config: PtySupervisorConfig, cols: number, rows: number): PtyHandle {
  try {
    return adaptPty(
      spawn(config.shell.file, [...config.shell.args], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: config.cwd,
        env: sanitizedEnvironment(process.env),
      })
    );
  } catch (cause) {
    throw new TerminalSpawnError(config.shell.file, cause);
  }
}
