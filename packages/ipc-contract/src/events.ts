import type { DocumentDiagnostics, Keybinding, SearchMatch, Settings } from '@pastecode/core';
import type { z } from 'zod';

import type { SerializedError } from './result.js';
import type { AiToolNameSchema } from './schemas/ai.js';
import type { DebugStatusSchema } from './schemas/debug.js';
import type {
  ExtensionContributionsSchema,
  ExtensionHostStatusSchema,
  ExtensionTextEditSchema,
  ListExtensionsResponseSchema,
} from './schemas/extensions.js';
import type { GitRepository } from './schemas/git.js';
import type { LspServerStatus } from './schemas/lsp.js';

/**
 * Payload de `search:result`: un lote de matches de la búsqueda en curso.
 *
 * Viaja de a lotes y no de a uno: una búsqueda sobre un repo grande produce
 * miles de matches, y un salto de proceso por cada uno cuesta más que la
 * búsqueda misma. El `searchId` lo eligió el renderer al pedirla y vuelve acá
 * para que pueda tirar lo que llegue de una consulta que ya reemplazó.
 */
export interface SearchResultEvent {
  searchId: string;
  matches: SearchMatch[];
}

/**
 * Payload de `search:done`: la búsqueda terminó.
 *
 * `truncated` dice que se cortó por el tope y no porque no hubiera más. Es la
 * diferencia entre "hay 40 resultados" y "hay al menos 1000", y la UI tiene
 * que poder decirlo sin mentir.
 */
export interface SearchDoneEvent {
  searchId: string;
  truncated: boolean;
  /** `null` si terminó bien. Si no, qué mostrar (RNF-25). */
  error: SerializedError | null;
}

/**
 * Qué le pasó a un archivo del workspace, según el watcher.
 *
 * Los tres casos son los que el renderer distingue de verdad: recargar una
 * pestaña limpia, avisar de un conflicto en una sucia, y marcar como borrado el
 * archivo que ya no está.
 */
export interface FileChangePayload {
  path: string;
  kind: 'created' | 'modified' | 'deleted';
}

/**
 * Payload de `files:changed`: qué cambió en el disco, en lotes.
 *
 * Viaja de a lotes por lo mismo que `search:result`: un `git checkout` toca
 * miles de archivos, y un salto de proceso por cada uno cuesta más que el
 * checkout. Cuando son demasiados, `isBulk` viene en `true` y `changes` vacío
 * **a propósito**: quien escucha revalida en bloque en vez de procesar diez mil
 * entradas en el hilo de UI, que es lo que rompería el presupuesto de RNF-06.
 */
export interface FilesChangedEvent {
  changes: FileChangePayload[];
  isBulk: boolean;
}

/**
 * Payload de `settings:changed`: las settings resueltas, después del cambio.
 *
 * Viaja el valor **resuelto** y no el archivo que cambió. El renderer no tiene
 * por qué saber si el cambio vino del archivo del usuario o del workspace, ni
 * volver a aplicar la precedencia: eso ya lo hizo el main una vez, y hacerlo
 * dos veces es tener dos implementaciones que se pueden contradecir.
 *
 * El `error` viaja **al lado** de las settings y no en lugar de ellas: cuando
 * alguien deja una coma de más en su `settings.json`, lo que corresponde es
 * seguir andando con los últimos valores buenos y además avisar. Es también el
 * momento exacto en que la persona se entera, porque acaba de guardar.
 */
export interface SettingsChangedEvent {
  settings: Settings;
  error: SerializedError | null;
}

/**
 * Payload de `keybindings:changed`: los atajos del usuario, después del cambio.
 *
 * Misma forma que `settings:changed` y por las mismas razones: viaja el valor
 * ya resuelto y el `error` va **al lado** y no en lugar de los atajos. Un
 * `keybindings.json` con una coma de más no puede dejar la aplicación sin
 * teclado; se sigue con los de fábrica y además se avisa.
 *
 * Los conflictos viajan con ellos porque se detectan sobre la lista completa
 * —fábrica más usuario—, y esa lista la arma el main al cargar.
 */
export interface KeybindingsChangedEvent {
  bindings: Keybinding[];
  /**
   * Los conflictos, con `commands` mutable.
   *
   * `KeybindingConflict` de `core` lo declara `readonly`, que es lo correcto
   * ahí adentro, pero lo que cruza el IPC se serializa y del otro lado se
   * reconstruye: pedir `readonly` en el contrato no protege nada y no coincide
   * con lo que infiere el schema Zod del canal.
   */
  conflicts: { key: string; commands: string[] }[];
  error: SerializedError | null;
}

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
 * `signal` es un **número**, no un string: es lo que devuelve node-pty, que
 * expone el número crudo del SO y no su nombre. Es `null` cuando el proceso
 * salió por las suyas, que es como la UI distingue "salió con 1" de "lo
 * matamos nosotros" en la limpieza de
 * [RNF-10](../../../docs/04-requerimientos-no-funcionales.md#confiabilidad).
 *
 * En Windows siempre es `null`: conpty no tiene señales.
 */
export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
  signal: number | null;
}

/**
 * Payload de `lsp:diagnostics`: los diagnósticos de N documentos.
 *
 * Viaja de a lotes por lo mismo que `search:result`: `publishDiagnostics` es
 * push del servidor, y un `tsc` sobre un proyecto roto publica cientos de
 * documentos en ráfaga. El main acumula y descarga cada 30ms o cada 50
 * documentos, que son los mismos números que ya usa la búsqueda.
 *
 * **Reemplaza, no acumula.** Un documento que aparece acá trae su lista
 * completa: así es como el protocolo dice que se borra un error arreglado, con
 * una publicación de lista vacía.
 */
export interface LspDiagnosticsEvent {
  serverId: string;
  documents: DocumentDiagnostics[];
}

/**
 * Payload de `lsp:serverChanged`: un servidor cambió de estado.
 *
 * Es **el hecho**; `lsp:status` es la pregunta. Hacen falta los dos porque los
 * servidores pueden estar corriendo cuando la ventana recarga, y ahí no hay
 * ningún hecho nuevo que contar. Mismo par que `git:getStatus` / `git:changed`.
 */
export interface LspServerChangedEvent {
  server: LspServerStatus;
}

/**
 * Payload de `git:changed`: el estado del repositorio, después del cambio.
 *
 * Viaja el estado **resuelto** y no un aviso vacío, por lo mismo que
 * `settings:changed`: el main acaba de correr `git status` para decidir que
 * había algo que contar, y hacer que el renderer lo vuelva a pedir sería correr
 * el mismo comando dos veces. `git:getStatus` sigue existiendo porque hace
 * falta al montar, cuando no hay ningún hecho nuevo que contar.
 */
export interface GitChangedEvent {
  repository: GitRepository | null;
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
/**
 * Payload de `extensions:hostChanged`: el estado **resuelto** del host.
 *
 * Va el estado entero y no un delta, igual que `git:changed` y por la misma
 * razón: quien lo recibe no tiene que reconstruir nada juntando eventos, y un
 * evento perdido no deja la UI desincronizada para siempre.
 */
export type ExtensionHostChangedEvent = z.infer<typeof ExtensionHostStatusSchema>;

/**
 * Payload de `extensions:changed`: el estado **resuelto** de lo que hay cargado.
 *
 * Va la lista entera y no un delta, igual que `git:changed`: quien lo recibe no
 * tiene que reconstruir nada juntando eventos, y un evento perdido no deja la
 * UI desincronizada para siempre.
 */
export type ExtensionsChangedEvent = z.infer<typeof ListExtensionsResponseSchema>;

/** Payload de `extensions:contributionsChanged`: comandos e ítems aportados. */
export type ExtensionContributionsEvent = z.infer<typeof ExtensionContributionsSchema>;

/**
 * Payload de `extensions:documentRequest`: la mitad del pull que va main → renderer.
 *
 * El main **no puede preguntarle nada al renderer**: la regla 6 de IPC de
 * `docs/02-arquitectura.md` dice que los eventos van del main al renderer y
 * nunca al revés. Así que la pregunta viaja como evento con un `requestId`, y
 * la respuesta vuelve por el canal `extensions:documentResponse`, que es un
 * `invoke` con su schema como cualquier otro. Ver ADR-0026.
 */
export interface ExtensionDocumentRequestEvent {
  /** Correlaciona con la respuesta. Lo elige el main. */
  requestId: string;
  /** Sobre qué archivo. */
  path: string;
  /** `read` pide el texto; `edit` pide aplicar cambios. */
  kind: 'read' | 'edit';
  /** La versión contra la que la extensión leyó. Sólo en `edit`. */
  version?: number;
  /** Los cambios a aplicar. Sólo en `edit`. */
  edits?: z.infer<typeof ExtensionTextEditSchema>[];
}

/**
 * Payload de `ai:delta`: un trozo de la respuesta que se está escribiendo.
 *
 * Viaja de a trozos y no de a uno completo por lo mismo que `search:result`:
 * una respuesta son cientos de chunks, y esperar al final para pintarla
 * convierte quince segundos de escritura en quince segundos de pantalla
 * quieta. El `requestId` lo eligió el renderer y vuelve acá para que pueda
 * tirar lo que llegue de una respuesta que ya canceló.
 *
 * **No se acumula en el main.** El renderer concatena; el main no guarda
 * historial de la conversación (ver `AiChatRequestSchema`).
 */
export interface AiDeltaEvent {
  requestId: string;
  /** El texto nuevo. Se concatena a lo que ya había. */
  text: string;
}

/**
 * Payload de `ai:toolCall`: el modelo quiere escribir un archivo.
 *
 * Es la mitad main → renderer del pull correlacionado de
 * [ADR-0026](../../../docs/adr/0026-broker-unico-y-pull-del-documento-activo.md),
 * exactamente como `extensions:documentRequest`: el main no le puede
 * *preguntar* nada al renderer, así que la pregunta viaja como evento con un
 * `toolCallId` y la respuesta vuelve por el canal `ai:toolResult`.
 *
 * **Sólo las herramientas de escritura llegan hasta acá.** Las de lectura se
 * resuelven enteras en el main; ver `READ_ONLY_TOOLS` en `@pastecode/core`.
 *
 * `previousContent` es `null` cuando el archivo no existe todavía: es lo que
 * le dice al diff que muestre una creación y no un reemplazo.
 */
export interface AiToolCallEvent {
  requestId: string;
  /** Correlaciona con la respuesta. Lo elige el modelo, lo valida el main. */
  toolCallId: string;
  tool: z.infer<typeof AiToolNameSchema>;
  /** Ruta absoluta, **ya validada** contra el workspace por el main. */
  path: string;
  /** Lo que el modelo propone dejar en el archivo. */
  nextContent: string;
  /** Lo que hay hoy, o `null` si el archivo no existe. */
  previousContent: string | null;
}

/**
 * Payload de `ai:done`: la respuesta terminó.
 *
 * `error` es `null` si terminó bien. Una cancelación **también llega por acá**,
 * con el código de `AiCancelledError`: quien escucha no tiene que distinguir
 * "terminó" de "lo cortaron" con un campo aparte, que es la misma forma de
 * `search:done`.
 */
export interface AiDoneEvent {
  requestId: string;
  error: SerializedError | null;
}

/**
 * Payload de `window:maximizedChanged`: la ventana se maximizó o se restauró.
 *
 * Hace falta un evento y no alcanza con `window:isMaximized` porque **el
 * estado cambia también sin que nadie apriete un botón**: arrastrar la ventana
 * al borde superior de la pantalla la maximiza, y un doble click en la barra
 * la restaura. Sin esto, el glifo del botón se queda mostrando lo contrario de
 * lo que pasó.
 *
 * Mismo par que `git:getStatus` / `git:changed`: la pregunta para el montaje,
 * el hecho para lo que pasa después.
 */
export interface WindowMaximizedChangedEvent {
  isMaximized: boolean;
}

export interface IpcEvents {
  'terminal:data': TerminalDataEvent;
  'terminal:exit': TerminalExitEvent;
  'settings:changed': SettingsChangedEvent;
  'keybindings:changed': KeybindingsChangedEvent;
  'search:result': SearchResultEvent;
  'search:done': SearchDoneEvent;
  'files:changed': FilesChangedEvent;
  'lsp:diagnostics': LspDiagnosticsEvent;
  'lsp:serverChanged': LspServerChangedEvent;
  'git:changed': GitChangedEvent;
  'extensions:hostChanged': ExtensionHostChangedEvent;
  'extensions:changed': ExtensionsChangedEvent;
  'extensions:contributionsChanged': ExtensionContributionsEvent;
  'extensions:documentRequest': ExtensionDocumentRequestEvent;
  'debug:stopped': DebugStoppedEvent;
  'debug:output': DebugOutputEvent;
  'debug:terminated': DebugTerminatedEvent;
  'ai:delta': AiDeltaEvent;
  'ai:toolCall': AiToolCallEvent;
  'ai:done': AiDoneEvent;
  'window:maximizedChanged': WindowMaximizedChangedEvent;
}

/**
 * Payload de `debug:stopped`: el programa frenó.
 *
 * Trae el hilo y el motivo, y **no** el stack: el call stack se pide con
 * `debug:getStackTrace` cuando el panel está a la vista. Meterlo acá haría que
 * cada paso de un `stepOver` arrastrara el stack entero aunque nadie lo mire.
 */
export interface DebugStoppedEvent {
  threadId: number;
  /** `breakpoint`, `step`, `exception`… Lo elige el adaptador. */
  reason: string;
  /** Dónde frenó, si el adaptador lo dice. Es lo que resalta el editor. */
  path: string | null;
  line: number | null;
}

/** Payload de `debug:output`: una línea de la consola de debug (RF-505). */
export interface DebugOutputEvent {
  /** `stdout`, `stderr`, `console`… Lo elige el adaptador. */
  category: string;
  text: string;
}

/** Payload de `debug:terminated`: la sesión se fue, con el estado que queda. */
export type DebugTerminatedEvent = z.infer<typeof DebugStatusSchema>;

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
  'settings:changed',
  'keybindings:changed',
  'search:result',
  'search:done',
  'files:changed',
  'lsp:diagnostics',
  'lsp:serverChanged',
  'git:changed',
  'extensions:hostChanged',
  'extensions:changed',
  'extensions:contributionsChanged',
  'extensions:documentRequest',
  'debug:stopped',
  'debug:output',
  'debug:terminated',
  'ai:delta',
  'ai:toolCall',
  'ai:done',
  'window:maximizedChanged',
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
