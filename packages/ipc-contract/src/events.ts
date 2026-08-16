/**
 * Payload de `terminal:data`: un chunk de salida del PTY.
 *
 * Llega tal cual lo escribió el proceso, con sus secuencias de escape ANSI
 * intactas. Interpretarlas es trabajo de xterm en el renderer; el main no toca
 * los bytes porque cualquier normalización acá rompe el cursor, los colores o
 * el redibujado de una TUI.
 */
export interface TerminalDataEvent {
  sessionId: string;
  chunk: string;
}

/**
 * Payload de `terminal:exit`: el proceso del PTY terminó.
 *
 * `exitCode` es `null` cuando el proceso murió por una señal, que es lo que
 * pasa en la limpieza de [RNF-10](../../../docs/04-requerimientos-no-funcionales.md).
 * La UI necesita distinguir "salió con 1" de "lo matamos nosotros".
 */
export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
  signal: string | null;
}

/**
 * Mapa de eventos que el main empuja al renderer. **Es la fuente de verdad**,
 * igual que `IpcChannels` lo es para el request/response.
 *
 * Existe porque `invoke` sólo sabe responder preguntas, y hay tres cosas de
 * esta etapa que el renderer no puede preguntar: la salida de un PTY, un
 * archivo de settings que cambió en disco y los resultados de una búsqueda que
 * llegan de a chorros. Ver [ADR-0013](../../../docs/adr/0013-eventos-tipados-en-el-ipc.md).
 *
 * A diferencia de un canal, un evento **no lleva schema Zod**: el emisor es el
 * main, que es código nuestro y privilegiado. Zod está en los requests porque
 * del otro lado hay un renderer del que hay que defenderse; validar acá sería
 * validarnos a nosotros mismos y pagarlo una vez por chunk de terminal.
 *
 * @example
 * type Chunk = EventPayload<'terminal:data'>; // { sessionId: string; chunk: string }
 */
export interface IpcEvents {
  'terminal:data': TerminalDataEvent;
  'terminal:exit': TerminalExitEvent;
}

export type EventName = keyof IpcEvents;
export type EventPayload<E extends EventName> = IpcEvents[E];

/**
 * Los nombres de evento, en runtime.
 *
 * `EventName` se borra al compilar, y el preload necesita una allow-list de
 * verdad: sin ella, un renderer comprometido puede pasarle a `ipcRenderer.on`
 * cualquier string —incluido un canal interno de Electron— y quedarse
 * escuchando tráfico que no le corresponde. El tipo describe la lista; esta
 * constante es la que la hace cumplir.
 *
 * El `satisfies` verifica que no sobre ningún nombre. Que no falte ninguno lo
 * verifica un test de tipos en `apps/desktop/src/main/ipc/emitter.test.ts`,
 * porque esa dirección no se puede expresar sin declarar el tipo dos veces.
 */
export const EVENT_NAMES = [
  'terminal:data',
  'terminal:exit',
] as const satisfies readonly EventName[];

/**
 * Dice si un string cualquiera nombra un evento del contrato.
 *
 * Vive en el contrato y no en el preload para que se pueda testear sin
 * Electron, que es la mitad del valor de tenerla separada.
 *
 * @param value Lo que haya mandado el renderer.
 * @returns `true` sólo para los nombres de `EVENT_NAMES`.
 * @example
 * isEventName('terminal:data'); // true
 * isEventName('ELECTRON_BROWSER_REQUIRE'); // false
 */
export function isEventName(value: unknown): value is EventName {
  // Se ensancha por asignación y no con `as`: `includes` de una tupla de
  // literales no acepta un string cualquiera, y la regla 2 de codigo.md
  // prohíbe la aserción. Esto no es un límite del sistema, es un tipo
  // demasiado preciso para lo que hace falta.
  const names: readonly string[] = EVENT_NAMES;

  return typeof value === 'string' && names.includes(value);
}
