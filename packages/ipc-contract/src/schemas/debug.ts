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
