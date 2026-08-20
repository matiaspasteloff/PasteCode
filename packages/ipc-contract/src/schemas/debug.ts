import { LaunchConfigurationSchema } from '@pastecode/core';
import { z } from 'zod';

/** En qué estado está el debugging. */
export const DebugStateSchema = z.enum([
  /** No hay adaptador configurado, o no se pudo resolver. */
  'unavailable',
  /** Hay adaptador y no hay sesión corriendo. */
  'idle',
  /** El adaptador arrancó y el programa está corriendo. */
  'running',
  /** Frenado en un breakpoint o en un paso. */
  'stopped',
]);

/** El estado del debugging, tal como lo ve el renderer. */
export const DebugStatusSchema = z.strictObject({
  state: DebugStateSchema,
  /**
   * Por qué no se puede debuggear, si no se puede.
   *
   * Es texto para la persona ([RNF-25](../../../../docs/04-requerimientos-no-funcionales.md)),
   * no un código: quien lo lee tiene que poder arreglarlo.
   */
  userMessage: z.string().nullable(),
  /** El hilo frenado, si hay uno. DAP numera los hilos. */
  threadId: z.number().nullable(),
});

/** Payload de `debug:getConfigurations`. Sin parámetros: se leen todas. */
export const GetLaunchConfigurationsRequestSchema = z.strictObject({});

/**
 * Respuesta de `debug:getConfigurations`.
 *
 * `error` viaja al lado de las configuraciones y no en lugar de ellas: un
 * archivo roto tiene cero configuraciones **y** un mensaje, y son dos cosas que
 * la UI muestra en lugares distintos.
 */
export const GetLaunchConfigurationsResponseSchema = z.strictObject({
  configurations: z.array(LaunchConfigurationSchema),
  error: z.strictObject({ code: z.string(), userMessage: z.string() }).nullable(),
});

/** Payload de `debug:getStatus`. Sin parámetros. */
export const GetDebugStatusRequestSchema = z.strictObject({});

/** Payload de `debug:start`: qué configuración correr. */
export const StartDebugRequestSchema = z.strictObject({
  /** El `name` de una configuración del `launch.json`. */
  configuration: z.string().min(1),
});

/** Respuesta de `debug:start`. El estado real llega por eventos. */
export const StartDebugResponseSchema = z.strictObject({});

/** Payload de `debug:stop`. Sin parámetros: hay una sesión a la vez. */
export const StopDebugRequestSchema = z.strictObject({});

/** Respuesta de `debug:stop`. */
export const StopDebugResponseSchema = z.strictObject({});

/**
 * Los cinco controles de ejecución de [RF-503](../../../../docs/03-requerimientos-funcionales.md).
 *
 * `continue` y los tres `step` son comandos de DAP con nombres distintos
 * —`continue`, `next`, `stepIn`, `stepOut`—; la traducción vive en el main. Se
 * nombran acá con las palabras de la UI y no con las del protocolo porque el
 * renderer no tiene por qué saber que "step over" se llama `next`.
 */
export const DebugStepSchema = z.enum(['continue', 'over', 'into', 'out', 'pause']);

/** Payload de `debug:step`: qué control se apretó. */
export const StepDebugRequestSchema = z.strictObject({
  step: DebugStepSchema,
});

/** Respuesta de `debug:step`. Lo que pase después llega por eventos. */
export const StepDebugResponseSchema = z.strictObject({});

/** Payload de `debug:setBreakpoints`: los de un archivo, reemplazando los que había. */
export const SetBreakpointsRequestSchema = z.strictObject({
  path: z.string().min(1),
  lines: z.array(z.int().min(1)),
});

/** Respuesta de `debug:setBreakpoints`. */
export const SetBreakpointsResponseSchema = z.strictObject({});

/** Payload de `debug:evaluate`: una expresión en el contexto frenado. */
export const EvaluateRequestSchema = z.strictObject({
  expression: z.string().min(1),
  /** El frame en el que evaluar. `null` es el contexto global. */
  frameId: z.number().nullable(),
});

/** Respuesta de `debug:evaluate`. */
export const EvaluateResponseSchema = z.strictObject({
  /** Lo que devolvió, ya renderizado por el adaptador. */
  result: z.string(),
  /** `true` si el adaptador rechazó la expresión. */
  failed: z.boolean(),
});

/** Un cuadro del call stack ([RF-504](../../../../docs/03-requerimientos-funcionales.md)). */
export const StackFrameSchema = z.strictObject({
  id: z.number(),
  name: z.string(),
  /** Ruta absoluta, o `null` si el frame no tiene archivo —código nativo—. */
  path: z.string().nullable(),
  /** Línea base 1. */
  line: z.number(),
});

/** Payload de `debug:getStackTrace`. Sin parámetros: el del hilo frenado. */
export const GetStackTraceRequestSchema = z.strictObject({});

/** Respuesta de `debug:getStackTrace`. */
export const GetStackTraceResponseSchema = z.strictObject({
  frames: z.array(StackFrameSchema),
});

/**
 * Una variable, o un scope, del panel de RF-504.
 *
 * `variablesReference` es de DAP: distinto de cero significa que se puede
 * expandir. Viaja tal cual porque es lo que hay que devolverle al adaptador
 * para pedir los hijos, y traducirlo a un booleano perdería justo eso.
 */
export const DebugVariableSchema = z.strictObject({
  name: z.string(),
  value: z.string(),
  variablesReference: z.number(),
});

/** Payload de `debug:getVariables`: los hijos de un scope o de una variable. */
export const GetVariablesRequestSchema = z.strictObject({
  /**
   * Qué expandir.
   *
   * `null` pide los **scopes** del frame —`Local`, `Global`, `Closure`—, que es
   * la raíz del árbol. Cualquier otro número pide los hijos de eso.
   */
  variablesReference: z.number().nullable(),
  /** El frame del que sacar los scopes. Sólo hace falta con `null`. */
  frameId: z.number().nullable(),
});

/** Respuesta de `debug:getVariables`. */
export const GetVariablesResponseSchema = z.strictObject({
  variables: z.array(DebugVariableSchema),
});
