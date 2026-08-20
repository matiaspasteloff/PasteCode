import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UnknownTerminalSessionError } from '@pastecode/core';
import type { TerminalDataEvent, TerminalExitEvent } from '@pastecode/ipc-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTempDirectory, removeTempDirectory } from '../test-support/temp-directory.js';

import type { PtySupervisor } from './pty.js';
import { createPtySupervisor } from './pty.js';

/** El shell falso: Node ejecutando el script de al lado. Ver fake-shell.mjs. */
const FAKE_SHELL = join(dirname(fileURLToPath(import.meta.url)), 'fake-shell.mjs');

/**
 * Techo de tiempo de este archivo, **aplicado de verdad**.
 *
 * `vi.setConfig` y no un tercer argumento en cada `it()`: la constante estaba
 * declarada desde el principio y no se le pasaba a ninguno, así que vitest
 * mataba los tests a los 5 s por omisión y el techo era decorativo. Configurarlo
 * una vez por archivo cierra la clase entera de error — un test que se agregue
 * mañana lo hereda sin que nadie se acuerde.
 */
const TIMEOUT_MS = 15_000;

vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

/**
 * Espera a que una condición se cumpla, sondeando.
 *
 * Sondear y no dormir un rato fijo es lo que mantiene el test fuera de la
 * categoría de flaky (regla 3 de testing.md): no hay ningún número mágico que
 * sea a la vez suficiente en el CI y rápido en una máquina de desarrollo.
 */
async function waitFor(condition: () => boolean, describeFailure: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Se agotó la espera: ${describeFailure}`);

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('createPtySupervisor', () => {
  let workspace: string;
  let supervisor: PtySupervisor;
  let output: string;
  let exits: TerminalExitEvent[];

  beforeEach(async () => {
    // El helper compartido y no un `mkdtemp` a secas: resuelve la ruta larga
    // —lo que en macOS convierte `/tmp` en `/private/tmp`, que es lo que el
    // proceso hijo informa como `cwd`, y en Windows expande el formato 8.3 que
    // aborta a libuv—.
    workspace = await makeTempDirectory('pastecode-pty-');
    output = '';
    exits = [];

    supervisor = createPtySupervisor({
      shell: { file: process.execPath, args: [FAKE_SHELL] },
      cwd: workspace,
      onData: (event: TerminalDataEvent) => {
        output += event.chunk;
      },
      onExit: (event) => exits.push(event),
    });
  });

  afterEach(async () => {
    await supervisor.disposeAll();
    // Con reintentos: `disposeAll` vuelve cuando pidió la salida, no cuando el
    // hijo terminó, y en Windows el `cwd` de un proceso todavía vivo bloquea el
    // directorio. Ver `removeTempDirectory`.
    await removeTempDirectory(workspace);
  });

  it('devuelve una sesión con su pid y su nombre para mostrar', () => {
    const session = supervisor.create({ cols: 80, rows: 24 });

    expect(session.sessionId).toBe('terminal-1');
    expect(session.displayName).toBe('node');
    expect(session.pid).toBeGreaterThan(0);
  });

  it('arranca el proceso en la raíz del workspace', async () => {
    supervisor.create({ cols: 80, rows: 24 });

    // RF-301: el cwd inicial es la raíz del workspace. Se verifica preguntándole
    // al proceso, no mirando lo que le pasamos.
    await waitFor(() => output.includes('CWD:'), 'el shell falso nunca anunció su cwd');
    expect(output).toContain(`CWD:${workspace}`);
  });

  it('no le pasa al shell las variables que inyecta Electron', async () => {
    // Se pone de verdad en el entorno del proceso de test: si sólo se
    // verificara que no está, el test pasaría igual sin la sanitización.
    process.env.ELECTRON_RUN_AS_NODE = '1';
    supervisor.create({ cols: 80, rows: 24 });

    await waitFor(
      () => output.includes('ELECTRON_RUN_AS_NODE:'),
      'el shell falso nunca anunció su entorno'
    );
    expect(output).toContain('ELECTRON_RUN_AS_NODE:unset');
  });

  it('entrega por onData lo que el proceso escribe', async () => {
    const session = supervisor.create({ cols: 80, rows: 24 });

    supervisor.write(session.sessionId, 'hola\r');

    await waitFor(() => output.includes('echo:hola'), 'el shell falso nunca respondió el eco');
  });

  it('avisa la salida con el código con el que terminó el proceso', async () => {
    const session = supervisor.create({ cols: 80, rows: 24 });

    supervisor.write(session.sessionId, 'exit 3\r');

    await waitFor(() => exits.length > 0, 'nunca llegó el evento de salida');
    expect(exits[0]).toMatchObject({ sessionId: session.sessionId, exitCode: 3 });
  });

  it('saca de la lista a la sesión que murió', async () => {
    const session = supervisor.create({ cols: 80, rows: 24 });

    expect(supervisor.list()).toHaveLength(1);

    supervisor.write(session.sessionId, 'exit 0\r');
    await waitFor(() => exits.length > 0, 'nunca llegó el evento de salida');

    expect(supervisor.list()).toHaveLength(0);
  });

  it('desambigua el nombre de la segunda sesión del mismo shell', () => {
    supervisor.create({ cols: 80, rows: 24 });
    const second = supervisor.create({ cols: 80, rows: 24 });

    // RF-302: el dropdown tiene que poder distinguirlas.
    expect(second.displayName).toBe('node (2)');
    expect(second.sessionId).toBe('terminal-2');
  });

  it('mata el proceso cuando se cierra la sesión desde la UI', async () => {
    const session = supervisor.create({ cols: 80, rows: 24 });

    supervisor.write(session.sessionId, 'spin\r');
    supervisor.dispose(session.sessionId);

    await waitFor(() => exits.length > 0, 'la sesión cerrada nunca murió');
    expect(supervisor.list()).toHaveLength(0);
  });

  it('deja cero sesiones vivas al cerrar la app, aunque estén ocupadas', async () => {
    // RF-305 y RNF-10: es el caso que importa. Tres procesos que no responden
    // y que igual tienen que morir cuando PasteCode se cierra.
    for (let opened = 0; opened < 3; opened += 1) {
      const session = supervisor.create({ cols: 80, rows: 24 });
      supervisor.write(session.sessionId, 'spin\r');
    }

    expect(supervisor.list()).toHaveLength(3);

    await supervisor.disposeAll();

    expect(supervisor.list()).toHaveLength(0);
    // Se espera el aviso en vez de darlo por llegado: lo que RF-305 promete es
    // que ningún proceso queda vivo, no que los tres `onExit` corran antes de
    // que `disposeAll` resuelva. Con la máquina cargada esa carrera se pierde.
    await waitFor(() => exits.length === 3, 'las tres sesiones nunca avisaron su salida');
  });

  it('acepta un resize sin romper la sesión', async () => {
    const session = supervisor.create({ cols: 80, rows: 24 });

    // RF-303. Los valores absurdos los acota `clampDimensions`; lo que se
    // verifica acá es que el PTY los tolera y sigue vivo.
    supervisor.resize(session.sessionId, { cols: 120, rows: 40 });
    supervisor.resize(session.sessionId, { cols: 1, rows: 1 });
    supervisor.write(session.sessionId, 'hola\r');

    await waitFor(
      () => output.includes('echo:hola'),
      'la sesión dejó de responder tras el resize'
    );
  });

  it('rechaza una sesión que no existe, en vez de ignorarla', () => {
    // Un no-op silencioso convertiría "el renderer guardó un id viejo" en una
    // terminal que no responde y que nadie sabe por qué.
    expect(() => {
      supervisor.write('terminal-99', 'hola');
    }).toThrow(UnknownTerminalSessionError);
  });

  it.each(['resize', 'dispose'] as const)(
    'rechaza %s sobre una sesión que no existe',
    (action) => {
      expect(() => {
        if (action === 'resize') supervisor.resize('terminal-99', { cols: 80, rows: 24 });
        else supervisor.dispose('terminal-99');
      }).toThrow(UnknownTerminalSessionError);
    }
  );
});
