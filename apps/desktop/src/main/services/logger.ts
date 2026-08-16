/**
 * El log de ciclo de vida de los procesos hijo.
 *
 * Una línea JSON por evento, y nada más. No es un framework de logging: es lo
 * que hace que "el servidor de TypeScript se reinició tres veces y se rindió"
 * sea una cosa que se puede leer en la consola del `.exe` en vez de una que
 * hay que deducir de que el autocompletado dejó de andar.
 *
 * **Sale por `console.warn` y `console.error` y no por `console.log`** porque
 * `no-console` sólo permite esos dos, y la razón por la que sólo permite esos
 * dos es que el `stdout` de un proceso de Electron empaquetado no lo lee nadie.
 */

/** Los eventos que valen una línea. Cerrado a propósito: un log libre no se lee. */
export type ProcessEventKind =
  'spawn' | 'exit' | 'restart' | 'give-up' | 'force-kill' | 'unhealthy';

/**
 * Lo que se puede adjuntar a una línea.
 *
 * Es un tipo cerrado y no un `Record<string, unknown>` para que la lista de lo
 * que se loguea sea revisable de un vistazo. Ver el porqué en `logProcess`.
 */
export interface ProcessLogDetails {
  readonly pid?: number;
  readonly exitCode?: number;
  readonly signal?: number | null;
  readonly attempt?: number;
  readonly attempts?: number;
  readonly delayMs?: number;
  readonly reason?: string;
}

/**
 * Escribe una línea de ciclo de vida.
 *
 * **`name` es el `basename` del ejecutable, nunca su ruta ni sus argumentos.**
 * No es una cuestión de verbosidad: una línea de comando de un servidor de
 * lenguaje contiene la ruta del workspace, y a veces la del proyecto adentro
 * del home de la persona. El log de un IDE termina pegado en un issue público
 * más seguido de lo que parece. Ver
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md).
 *
 * @param kind Qué pasó.
 * @param name Nombre corto del proceso. `basename`, sin ruta.
 * @param details Números del evento, si hay.
 * @example
 * logProcess('spawn', 'typescript-language-server', { pid: 4321 });
 * // {"scope":"process","event":"spawn","name":"typescript-language-server","pid":4321}
 */
export function logProcess(
  kind: ProcessEventKind,
  name: string,
  details: ProcessLogDetails = {}
): void {
  const line = JSON.stringify({ scope: 'process', event: kind, name, ...details });

  if (kind === 'give-up') {
    console.error(line);
    return;
  }

  console.warn(line);
}
