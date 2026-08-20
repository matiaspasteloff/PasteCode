import type { Breakpoint } from '@pastecode/core';
import type { DebugOutputEvent, DebugStoppedEvent, Response } from '@pastecode/ipc-contract';
import {
  EvaluateRequestSchema,
  GetDebugStatusRequestSchema,
  GetLaunchConfigurationsRequestSchema,
  GetStackTraceRequestSchema,
  GetVariablesRequestSchema,
  SetBreakpointsRequestSchema,
  StartDebugRequestSchema,
  StepDebugRequestSchema,
  StopDebugRequestSchema,
} from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import { createDebugClient } from '../debug/client.js';
import { readLaunchConfigurations } from '../debug/launch-file.js';
import { resolveAdapter } from '../debug/resolve-adapter.js';
import type { DebugSession } from '../debug/session.js';
import { createDebugSession } from '../debug/session.js';
import { currentSettings } from '../services/settings.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * La sesión de esta corrida, o `null` si no hay ninguna.
 *
 * **Una sola sesión a la vez.** Varias sesiones simultáneas son una feature de
 * IDE grande —depurar cliente y servidor juntos— que está fuera de alcance, y
 * soportarla cambiaría cada canal de acá para llevar un identificador. Empezar
 * con una y agregarlas después es barato; al revés, no.
 */
let session: DebugSession | null = null;

/**
 * Los breakpoints que el renderer reportó, por archivo.
 *
 * Se guardan **haya sesión o no**: son lo que se le manda al adaptador al
 * arrancar la próxima, y sin esto poner un breakpoint antes de apretar F5 no
 * serviría de nada. El renderer es la fuente de verdad —los persiste con la
 * sesión— y esto es sólo la copia que el main necesita para el arranque.
 */
const breakpointLines = new Map<string, number[]>();

/** Los breakpoints acumulados, en la forma que espera la sesión. */
function knownBreakpoints(): Breakpoint[] {
  return [...breakpointLines].flatMap(([path, lines]) =>
    lines.map((line) => ({ path, line, enabled: true }))
  );
}

/** Manda un evento de debug a todas las ventanas. */
function broadcastStopped(event: DebugStoppedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) emit(window, 'debug:stopped', event);
}

/** Ídem para una línea de la consola. */
function broadcastOutput(event: DebugOutputEvent): void {
  for (const window of BrowserWindow.getAllWindows()) emit(window, 'debug:output', event);
}

/** Ídem para el final de la sesión, con el estado que queda. */
function broadcastTerminated(): void {
  session = null;

  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'debug:terminated', currentStatus());
  }
}

/** El estado de ahora: qué se puede hacer y por qué no. */
function currentStatus(): Response<'debug:getStatus'> {
  const resolved = resolveAdapter(currentSettings(), process.execPath, process.env);

  // Sin adaptador el debugging queda **apagado con explicación**, no roto: es
  // el mismo estado que un servidor de lenguaje sin instalar, y el resto del
  // IDE no se entera.
  if ('problem' in resolved) {
    return { state: 'unavailable', userMessage: resolved.problem.userMessage, threadId: null };
  }

  if (session === null) return { state: 'idle', userMessage: null, threadId: null };

  const threadId = session.stoppedThread();

  return {
    state: threadId === null ? 'running' : 'stopped',
    userMessage: null,
    threadId,
  };
}

/**
 * Arranca una sesión con la configuración que se le nombró.
 *
 * @throws {Error} Si no hay adaptador, o si esa configuración no existe.
 */
async function startSession(name: string, breakpoints: readonly Breakpoint[]): Promise<void> {
  const root = requireWorkspaceRoot();
  const resolved = resolveAdapter(currentSettings(), process.execPath, process.env);

  if ('problem' in resolved) throw new Error(resolved.problem.userMessage);

  const found = await readLaunchConfigurations(root);
  const configuration = found.configurations.find((candidate) => candidate.name === name);

  if (configuration === undefined) {
    throw new Error(`No hay ninguna configuración de debug llamada "${name}".`);
  }

  // La sesión anterior se corta antes de abrir otra: dos adaptadores vivos
  // pelearían por los mismos breakpoints y por la misma consola.
  await session?.stop();

  session = createDebugSession({
    createClient: (onEvent) =>
      createDebugClient({
        launch: resolved.launch,
        cwd: root,
        requestTimeoutMs: currentSettings().debug.requestTimeoutMs,
        onEvent,
        onExit: broadcastTerminated,
      }),
    workspaceRoot: root,
    onStopped: broadcastStopped,
    onOutput: broadcastOutput,
    onTerminated: broadcastTerminated,
  });

  await session.start(configuration, breakpoints);
}

/**
 * Registra los handlers del dominio `debug`.
 *
 * @example
 * registerDebugIpcHandlers(); // antes de app.whenReady()
 */
export function registerDebugIpcHandlers(): void {
  registerSessionHandlers();
  registerInspectionHandlers();

  registerHandler(
    'debug:getConfigurations',
    GetLaunchConfigurationsRequestSchema,
    async (): Promise<Response<'debug:getConfigurations'>> =>
      readLaunchConfigurations(requireWorkspaceRoot())
  );

  registerHandler('debug:getStatus', GetDebugStatusRequestSchema, currentStatus);
}

/** Los que empiezan, terminan y mueven la sesión (RF-503). */
function registerSessionHandlers(): void {
  registerHandler(
    'debug:start',
    StartDebugRequestSchema,
    async (payload): Promise<Response<'debug:start'>> => {
      await startSession(payload.configuration, knownBreakpoints());

      return {};
    }
  );

  registerHandler(
    'debug:stop',
    StopDebugRequestSchema,
    async (): Promise<Response<'debug:stop'>> => {
      await session?.stop();
      session = null;

      return {};
    }
  );

  registerHandler(
    'debug:step',
    StepDebugRequestSchema,
    async (payload): Promise<Response<'debug:step'>> => {
      await session?.step(payload.step);

      return {};
    }
  );

  registerHandler(
    'debug:setBreakpoints',
    SetBreakpointsRequestSchema,
    async (payload): Promise<Response<'debug:setBreakpoints'>> => {
      if (payload.lines.length === 0) breakpointLines.delete(payload.path);
      else breakpointLines.set(payload.path, [...payload.lines]);

      await session?.setBreakpoints(payload.path, payload.lines);

      return {};
    }
  );
}

/** Los que miran adentro de una sesión frenada (RF-504 y RF-505). */
function registerInspectionHandlers(): void {
  registerHandler(
    'debug:evaluate',
    EvaluateRequestSchema,
    async (payload): Promise<Response<'debug:evaluate'>> =>
      (await session?.evaluate(payload.expression, payload.frameId)) ?? {
        result: 'No hay ninguna sesión de debug corriendo.',
        failed: true,
      }
  );

  registerHandler(
    'debug:getStackTrace',
    GetStackTraceRequestSchema,
    async (): Promise<Response<'debug:getStackTrace'>> => ({
      frames: (await session?.stackTrace()) ?? [],
    })
  );

  registerHandler(
    'debug:getVariables',
    GetVariablesRequestSchema,
    async (payload): Promise<Response<'debug:getVariables'>> => ({
      variables: (await session?.variables(payload.variablesReference, payload.frameId)) ?? [],
    })
  );
}
