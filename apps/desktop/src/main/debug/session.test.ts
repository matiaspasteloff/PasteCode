import type { Breakpoint, LaunchConfiguration } from '@pastecode/core';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DebugClient } from './client.js';
import type { DebugSession } from './session.js';
import { createDebugSession } from './session.js';

/** Una llamada que la sesión mandó al adaptador. */
interface Sent {
  command: string;
  args: unknown;
}

/** Lo que el adaptador de mentira contesta a cada comando. */
const REPLIES: Record<string, unknown> = {
  initialize: { supportsConfigurationDoneRequest: true },
  stackTrace: {
    stackFrames: [
      { id: 7, name: 'sumar', line: 12, source: { path: 'C:\\p\\a.js' } },
      { id: 8, name: 'nativo', line: 0 },
    ],
  },
  scopes: { scopes: [{ name: 'Local', variablesReference: 100 }] },
  variables: { variables: [{ name: 'a', value: '1', variablesReference: 0 }] },
  evaluate: { result: '3' },
};

let sent: Sent[];
let emit: (event: DebugProtocol.Event) => void;
let session: DebugSession;
let stopped: { threadId: number; reason: string }[];
let output: string[];
let terminations: number;
let failing: Set<string>;

/** Un cliente de mentira: anota lo que sale y contesta la tabla de arriba. */
function fakeClient(onEvent: (event: DebugProtocol.Event) => void): DebugClient {
  emit = onEvent;

  return {
    start: () => undefined,
    isRunning: () => true,
    stop: () => Promise.resolve(),

    send: <TBody>(command: string, args?: unknown): Promise<TBody> => {
      sent.push({ command, args });

      if (failing.has(command)) return Promise.reject(new Error(`no puedo ${command}`));

      // El doble está parado justo donde el cliente de verdad tiene su límite
      // del sistema: lo que vuelve de un adaptador es `unknown` y quien llama
      // sabe qué comando mandó. La tabla de respuestas de arriba es lo que hace
      // las veces del adaptador.
      // eslint-disable-next-line no-restricted-syntax
      return Promise.resolve(REPLIES[command] as TBody);
    },
  };
}

/** Una configuración mínima del `launch.json`. */
const CONFIG: LaunchConfiguration = { type: 'node', request: 'launch', name: 'App' };

/** Un breakpoint activo en un archivo. */
function breakpointAt(path: string, line: number, enabled = true): Breakpoint {
  return { path, line, enabled };
}

/** Los comandos que salieron, en orden. */
function commands(): string[] {
  return sent.map((call) => call.command);
}

/** Arranca la sesión y deja pasar el `initialized`. */
async function startSession(breakpoints: readonly Breakpoint[] = []): Promise<void> {
  const starting = session.start(CONFIG, breakpoints);

  // El adaptador manda `initialized` después del `initialize`, que es el orden
  // que el protocolo define y el que la sesión espera.
  await Promise.resolve();
  emit({ seq: 1, type: 'event', event: 'initialized' });
  await starting;
}

beforeEach(() => {
  sent = [];
  stopped = [];
  output = [];
  terminations = 0;
  failing = new Set();

  session = createDebugSession({
    createClient: fakeClient,
    workspaceRoot: 'C:\\p',
    onStopped: (event) => stopped.push(event),
    onOutput: (event) => output.push(event.text),
    onTerminated: () => {
      terminations += 1;
    },
  });
});

describe('la coreografía del arranque', () => {
  it('manda initialize, después el launch, y cierra con configurationDone', async () => {
    await startSession();

    expect(commands()).toEqual(['initialize', 'launch', 'configurationDone']);
  });

  it('manda los breakpoints después del initialized y antes del configurationDone', async () => {
    // **Es el error clásico de DAP.** Mandarlos antes del `initialized` los
    // descarta en silencio: el adaptador todavía no tiene dónde ponerlos, y el
    // programa arranca y no frena nunca.
    await startSession([breakpointAt('C:\\p\\a.js', 12)]);

    expect(commands()).toEqual(['initialize', 'launch', 'setBreakpoints', 'configurationDone']);
  });

  it('agrupa los breakpoints por archivo en una sola llamada', async () => {
    await startSession([
      breakpointAt('C:\\p\\a.js', 3),
      breakpointAt('C:\\p\\a.js', 12),
      breakpointAt('C:\\p\\b.js', 5),
    ]);

    // DAP reemplaza **todos** los de un archivo por llamada: una por línea
    // dejaría sólo la última de cada archivo.
    const calls = sent.filter((call) => call.command === 'setBreakpoints');

    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toMatchObject({
      source: { path: 'C:\\p\\a.js' },
      breakpoints: [{ line: 3 }, { line: 12 }],
    });
  });

  it('no le manda al adaptador los breakpoints desactivados', async () => {
    await startSession([breakpointAt('C:\\p\\a.js', 12, false)]);

    expect(commands()).not.toContain('setBreakpoints');
  });

  it('no manda configurationDone si el adaptador no lo declara', async () => {
    REPLIES.initialize = {};

    await startSession();

    expect(commands()).toEqual(['initialize', 'launch']);

    REPLIES.initialize = { supportsConfigurationDoneRequest: true };
  });

  it('usa el request de la configuración: attach en vez de launch', async () => {
    const starting = session.start({ ...CONFIG, request: 'attach' }, []);

    await Promise.resolve();
    emit({ seq: 1, type: 'event', event: 'initialized' });
    await starting;

    expect(commands()).toContain('attach');
  });
});

describe('los controles de RF-503', () => {
  beforeEach(async () => {
    await startSession();
    emit({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { threadId: 3, reason: 'breakpoint' },
    });
    sent = [];
  });

  it('traduce cada control al comando de DAP que le corresponde', async () => {
    for (const step of ['continue', 'over', 'into', 'out'] as const) {
      emit({ seq: 9, type: 'event', event: 'stopped', body: { threadId: 3, reason: 'step' } });
      await session.step(step);
    }

    // El renderer no tiene por qué saber que "step over" se llama `next`.
    expect(commands()).toEqual(['continue', 'next', 'stepIn', 'stepOut']);
  });

  it('manda el hilo frenado y no uno inventado', async () => {
    await session.step('over');

    expect(sent[0]?.args).toEqual({ threadId: 3 });
  });

  it('ignora un paso cuando no hay nada frenado', async () => {
    await session.step('continue');
    sent = [];

    // Un click de más mandaría un `next` sin hilo, y el adaptador contestaría
    // un error que nadie pidió.
    await session.step('over');

    expect(sent).toEqual([]);
  });

  it('pause sí se manda mientras corre, que es para lo que existe', async () => {
    await session.step('continue');
    sent = [];

    await session.step('pause');

    expect(commands()).toEqual(['pause']);
  });
});

describe('el estado del hilo', () => {
  it('lo anota al frenar y lo suelta al continuar', async () => {
    await startSession();

    expect(session.stoppedThread()).toBeNull();

    emit({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { threadId: 3, reason: 'breakpoint' },
    });
    expect(session.stoppedThread()).toBe(3);

    emit({ seq: 3, type: 'event', event: 'continued', body: {} });
    expect(session.stoppedThread()).toBeNull();
  });

  it('avisa del freno con su motivo', async () => {
    await startSession();
    emit({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { threadId: 3, reason: 'exception' },
    });

    expect(stopped).toEqual([{ threadId: 3, reason: 'exception', path: null, line: null }]);
  });

  it('asume el hilo 1 si el adaptador no lo dice', async () => {
    await startSession();
    emit({ seq: 2, type: 'event', event: 'stopped', body: { reason: 'pause' } });

    expect(session.stoppedThread()).toBe(1);
  });
});

describe('RF-505: la consola', () => {
  it('publica cada línea de output con su categoría', async () => {
    await startSession();
    emit({
      seq: 2,
      type: 'event',
      event: 'output',
      body: { category: 'stdout', output: 'hola\n' },
    });

    expect(output).toEqual(['hola\n']);
  });

  it('evalúa en el frame que se le pida', async () => {
    await startSession();
    emit({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { threadId: 3, reason: 'breakpoint' },
    });

    const result = await session.evaluate('a + b', 7);

    expect(result).toEqual({ result: '3', failed: false });
    expect(sent.at(-1)?.args).toMatchObject({
      expression: 'a + b',
      frameId: 7,
      context: 'repl',
    });
  });

  it('una expresión que el adaptador rechaza es un resultado, no una falla', async () => {
    await startSession();
    failing.add('evaluate');

    // Escribir mal una expresión es lo normal en una consola. Que lance haría
    // que la UI muestre un error de la aplicación por un typo de quien escribe.
    await expect(session.evaluate('no existe', null)).resolves.toMatchObject({ failed: true });
  });
});

describe('RF-504: call stack y variables', () => {
  beforeEach(async () => {
    await startSession();
    emit({
      seq: 2,
      type: 'event',
      event: 'stopped',
      body: { threadId: 3, reason: 'breakpoint' },
    });
  });

  it('devuelve los frames con su archivo y su línea', async () => {
    const frames = await session.stackTrace();

    expect(frames[0]).toEqual({ id: 7, name: 'sumar', path: 'C:\\p\\a.js', line: 12 });
  });

  it('un frame sin archivo llega con path en null', async () => {
    // Código nativo. Inventarle una ruta haría que la UI intente abrir algo
    // que no existe.
    expect((await session.stackTrace())[1]?.path).toBeNull();
  });

  it('sin nada frenado el stack está vacío en vez de fallar', async () => {
    await session.step('continue');

    await expect(session.stackTrace()).resolves.toEqual([]);
  });

  it('pide los scopes cuando no se le da una referencia', async () => {
    const scopes = await session.variables(null, 7);

    // Un scope se ve como una variable expandible: es lo que hace que el panel
    // sea un solo árbol y no dos listas anidadas a mano.
    expect(scopes).toEqual([{ name: 'Local', value: '', variablesReference: 100 }]);
    expect(sent.at(-1)?.command).toBe('scopes');
  });

  it('pide los hijos cuando sí se le da una', async () => {
    const children = await session.variables(100, null);

    expect(children).toEqual([{ name: 'a', value: '1', variablesReference: 0 }]);
    expect(sent.at(-1)).toMatchObject({
      command: 'variables',
      args: { variablesReference: 100 },
    });
  });
});

describe('el final de la sesión', () => {
  it('avisa cuando el programa termina', async () => {
    await startSession();
    emit({ seq: 2, type: 'event', event: 'terminated', body: {} });

    expect(terminations).toBe(1);
    expect(session.stoppedThread()).toBeNull();
  });

  it('al cortarla manda disconnect llevándose al programa depurado', async () => {
    await startSession();
    sent = [];

    await session.stop();

    // `terminateDebuggee` y no dejarlo corriendo sin nadie mirándolo.
    expect(sent[0]).toMatchObject({
      command: 'disconnect',
      args: { terminateDebuggee: true },
    });
  });

  it('cortar una sesión que no existe no falla', async () => {
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it('un disconnect que falla igual apaga el adaptador', async () => {
    await startSession();
    failing.add('disconnect');

    // Un adaptador que ya se murió no va a contestar el `disconnect`, y eso no
    // puede dejar la sesión colgada para siempre.
    await expect(session.stop()).resolves.toBeUndefined();
    expect(session.stoppedThread()).toBeNull();
  });
});
