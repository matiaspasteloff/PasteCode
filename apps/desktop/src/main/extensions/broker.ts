import { randomUUID } from 'node:crypto';

import type { Capability } from '@pastecode/extension-api';
import { assertCapability } from '@pastecode/extension-host';
import { MAIN_METHODS } from '@pastecode/extension-host';
import type { RpcEndpoint } from '@pastecode/extension-host';
import type {
  ExtensionContributionsEvent,
  ExtensionDocumentRequestEvent,
} from '@pastecode/ipc-contract';

/** Cuánto se espera al renderer antes de dar el pull por perdido. */
const PULL_TIMEOUT_MS = 5000;

/** Lo que el broker necesita saber de cada extensión para dejarla actuar. */
interface ExtensionGrant {
  name: string;
  capabilities: readonly Capability[];
}

/** Cómo se arma el broker. */
export interface BrokerConfig {
  /** Se llama cuando cambian los comandos o los ítems aportados. */
  readonly onContributionsChanged: (contributions: ExtensionContributionsEvent) => void;
  /** Manda la pregunta al renderer. La respuesta vuelve por `resolveDocument`. */
  readonly askRenderer: (request: ExtensionDocumentRequestEvent) => void;
}

/** El broker: la autoridad del main sobre lo que hacen las extensiones. */
export interface ExtensionBroker {
  /** Engancha los `main/*` al endpoint de un host recién nacido. */
  attach(rpc: RpcEndpoint): void;
  /** Anota qué declaró cada extensión. Lo llama el servicio tras cada carga. */
  grant(grants: readonly ExtensionGrant[]): void;
  /** Lo aportado hasta ahora, para servir el estado inicial. */
  contributions(): ExtensionContributionsEvent;
  /** Entrega la respuesta del renderer a su pregunta. */
  resolveDocument(requestId: string, text: string | null, applied?: boolean): void;
  /** Olvida todo. Se llama cuando el host muere. */
  reset(): void;
}

/** Una pregunta al renderer que todavía no volvió. */
interface PendingPull {
  readonly settle: (value: { text: string | null; applied?: boolean }) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Todo lo que el broker va acumulando. */
interface BrokerState {
  readonly config: BrokerConfig;
  readonly capabilities: Map<string, readonly Capability[]>;
  readonly commands: Map<string, ExtensionContributionsEvent['commands'][number]>;
  readonly statusItems: Map<string, ExtensionContributionsEvent['statusItems'][number]>;
  readonly pulls: Map<string, PendingPull>;
  rpc: RpcEndpoint | null;
}

/**
 * Crea el broker de extensiones del main.
 *
 * **El main es el único broker.** El host no le habla al renderer y el renderer
 * no le habla al host: todo pasa por acá, que es lo que permite verificar las
 * capabilities en el único proceso que las puede hacer cumplir
 * ([RNF-14](../../../../../docs/04-requerimientos-no-funcionales.md)) y lo que
 * hace que descargar una extensión sea borrar sus entradas de dos mapas. Ver
 * [ADR-0026](../../../../../docs/adr/0026-broker-unico-y-pull-del-documento-activo.md).
 *
 * @param config A quién avisarle de los cambios y cómo preguntarle al renderer.
 * @returns El broker, todavía sin host enganchado.
 * @example
 * const broker = createExtensionBroker({ onContributionsChanged, askRenderer });
 */
export function createExtensionBroker(config: BrokerConfig): ExtensionBroker {
  const state: BrokerState = {
    config,
    capabilities: new Map(),
    commands: new Map(),
    statusItems: new Map(),
    pulls: new Map(),
    rpc: null,
  };

  return {
    attach: (rpc) => {
      attach(state, rpc);
    },

    grant(grants) {
      state.capabilities.clear();

      for (const entry of grants) state.capabilities.set(entry.name, entry.capabilities);
    },

    contributions: () => contributionsOf(state),

    resolveDocument(requestId, text, applied) {
      const pending = state.pulls.get(requestId);

      // Una respuesta sin pregunta es lo normal después de un timeout. Igual
      // que en el RPC: descartarla es lo correcto.
      if (pending === undefined) return;

      clearTimeout(pending.timer);
      state.pulls.delete(requestId);
      pending.settle({ text, ...(applied === undefined ? {} : { applied }) });
    },

    reset() {
      state.capabilities.clear();
      state.commands.clear();
      state.statusItems.clear();

      for (const [, pending] of state.pulls) {
        clearTimeout(pending.timer);
        pending.settle({ text: null });
      }

      state.pulls.clear();
      state.rpc = null;
      publish(state);
    },
  };
}

/** Engancha los métodos que el host puede llamar. */
function attach(state: BrokerState, rpc: RpcEndpoint): void {
  state.rpc = rpc;

  rpc.handle(MAIN_METHODS.registerCommand, (params) => {
    const { extension, id } = readCommand(params);

    state.commands.set(`${extension} ${id}`, { extension, id, title: id });
    publish(state);

    return null;
  });

  rpc.handle(MAIN_METHODS.unregisterCommand, (params) => {
    const { extension, id } = readCommand(params);

    state.commands.delete(`${extension} ${id}`);
    publish(state);

    return null;
  });

  rpc.handle(MAIN_METHODS.executeCommand, (params) => {
    const { extension, id } = readCommand(params);

    // Una extensión ejecutando un comando de otra pasa igual por acá: el main
    // es quien sabe quién registró qué.
    return runExtensionCommand(state, extension, id);
  });

  attachStatusBar(state, rpc);
  attachDocument(state, rpc);
}

/** Los tres métodos de la status bar. */
function attachStatusBar(state: BrokerState, rpc: RpcEndpoint): void {
  rpc.handle(MAIN_METHODS.createStatusBarItem, (params) => {
    const extension = readString(params, 'extension');

    allow(state, extension, 'statusBar');

    const itemId = randomUUID();
    const options = readField(params, 'options');

    state.statusItems.set(itemId, {
      extension,
      itemId,
      text: '',
      alignment: readAlignment(options),
      priority: readNumber(options, 'priority') ?? 0,
    });

    // Nace oculto: se publica recién cuando le ponen texto y lo muestran. Al
    // revés parpadearía vacío.
    return itemId;
  });

  rpc.handle(MAIN_METHODS.updateStatusBarItem, (params) => {
    const extension = readString(params, 'extension');

    allow(state, extension, 'statusBar');
    updateStatusItem(
      state,
      extension,
      readString(params, 'itemId'),
      readField(params, 'patch')
    );

    return null;
  });

  rpc.handle(MAIN_METHODS.disposeStatusBarItem, (params) => {
    const extension = readString(params, 'extension');

    allow(state, extension, 'statusBar');
    ownedItem(state, extension, readString(params, 'itemId'));
    state.statusItems.delete(readString(params, 'itemId'));
    publish(state);

    return null;
  });
}

/** Los dos métodos que necesitan preguntarle al renderer. */
function attachDocument(state: BrokerState, rpc: RpcEndpoint): void {
  rpc.handle(MAIN_METHODS.getDocumentText, async (params) => {
    const extension = readString(params, 'extension');

    allow(state, extension, 'documentRead');

    const answer = await pull(state, { kind: 'read', path: readString(params, 'path') });

    return answer.text;
  });

  rpc.handle(MAIN_METHODS.applyEdits, async (params) => {
    const extension = readString(params, 'extension');

    allow(state, extension, 'documentWrite');

    const edits = readField(params, 'edits');
    const answer = await pull(state, {
      kind: 'edit',
      path: readString(params, 'path'),
      version: readNumber(params, 'version') ?? 0,
      edits: Array.isArray(edits) ? readEdits(edits) : [],
    });

    return answer.applied === true;
  });
}

/**
 * Le pregunta al renderer y espera la respuesta correlacionada.
 *
 * Es el pull de ADR-0026: la pregunta va como evento porque el main no puede
 * invocar al renderer —regla 6 de IPC de `docs/02-arquitectura.md`—, y la
 * respuesta vuelve por un canal `invoke` normal con su schema.
 */
function pull(
  state: BrokerState,
  question: Omit<ExtensionDocumentRequestEvent, 'requestId'>
): Promise<{ text: string | null; applied?: boolean }> {
  const requestId = randomUUID();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.pulls.delete(requestId);
      // Sin respuesta se contesta "no hay texto" en vez de rechazar: una
      // ventana que se cerró mientras una extensión preguntaba no es un error
      // de la extensión.
      resolve({ text: null });
    }, PULL_TIMEOUT_MS);

    state.pulls.set(requestId, { settle: resolve, timer });
    state.config.askRenderer({ requestId, ...question });
  });
}

/** Le pide al host que corra un comando que registró una extensión. */
async function runExtensionCommand(
  state: BrokerState,
  extension: string,
  id: string
): Promise<null> {
  if (state.rpc === null) throw new Error('El extension host no está disponible');

  await state.rpc.request('host/runCommand', { extension, id, args: [] });

  return null;
}

/** Verifica que la extensión haya declarado lo que está por usar. */
function allow(state: BrokerState, extension: string, needed: Capability): void {
  assertCapability(extension, state.capabilities.get(extension) ?? [], needed);
}

/** El ítem, si de verdad es de esa extensión. */
function ownedItem(
  state: BrokerState,
  extension: string,
  itemId: string
): ExtensionContributionsEvent['statusItems'][number] {
  const item = state.statusItems.get(itemId);

  // La atribución no es paranoia: el `itemId` viaja por un canal que del otro
  // lado maneja código de terceros, así que nada impide que una extensión mande
  // el id de otra. El main es el único que puede notar la diferencia.
  if (item?.extension !== extension) {
    throw new Error(`El ítem "${itemId}" no es de "${extension}"`);
  }

  return item;
}

/** Aplica un parche parcial a un ítem y publica. */
function updateStatusItem(
  state: BrokerState,
  extension: string,
  itemId: string,
  patch: unknown
): void {
  const item = ownedItem(state, extension, itemId);
  const text = readString2(patch, 'text');
  const tooltip = readString2(patch, 'tooltip');
  const command = readString2(patch, 'command');
  const visible = readField(patch, 'visible');

  const next = {
    ...item,
    ...(text === undefined ? {} : { text }),
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(command === undefined ? {} : { command }),
  };

  if (visible === false) state.statusItems.delete(itemId);
  else state.statusItems.set(itemId, next);

  publish(state);
}

/** Lo aportado hasta ahora, ordenado como lo va a dibujar la barra. */
function contributionsOf(state: BrokerState): ExtensionContributionsEvent {
  return {
    commands: [...state.commands.values()],
    statusItems: [...state.statusItems.values()].sort((a, b) => b.priority - a.priority),
  };
}

/** Avisa que cambió lo aportado. */
function publish(state: BrokerState): void {
  state.config.onContributionsChanged(contributionsOf(state));
}

/** El par extensión/comando de unos params. */
function readCommand(params: unknown): { extension: string; id: string } {
  return { extension: readString(params, 'extension'), id: readString(params, 'id') };
}

/** Un campo string obligatorio. Lanza, y el error vuelve por el protocolo. */
function readString(params: unknown, field: string): string {
  const value = readField(params, field);

  if (typeof value !== 'string') throw new Error(`Falta el parámetro "${field}"`);

  return value;
}

/** Un campo string opcional. */
function readString2(params: unknown, field: string): string | undefined {
  const value = readField(params, field);

  return typeof value === 'string' ? value : undefined;
}

/** Un campo numérico opcional. */
function readNumber(params: unknown, field: string): number | undefined {
  const value = readField(params, field);

  return typeof value === 'number' ? value : undefined;
}

/** La alineación pedida, o la de por omisión. */
function readAlignment(options: unknown): 'left' | 'right' {
  return readString2(options, 'alignment') === 'left' ? 'left' : 'right';
}

/** Los cambios pedidos, quedándose sólo con los que tienen forma de cambio. */
function readEdits(
  edits: readonly unknown[]
): NonNullable<ExtensionDocumentRequestEvent['edits']> {
  return edits.flatMap((edit) => {
    const range = readField(edit, 'range');
    const start = readPosition(readField(range, 'start'));
    const end = readPosition(readField(range, 'end'));
    const newText = readString2(edit, 'newText');

    if (start === null || end === null || newText === undefined) return [];

    return [{ range: { start, end }, newText }];
  });
}

/** Una posición base 1, o `null` si no lo es. */
function readPosition(value: unknown): { line: number; column: number } | null {
  const line = readNumber(value, 'line');
  const column = readNumber(value, 'column');

  if (line === undefined || column === undefined) return null;

  return { line, column };
}

/** Saca un campo sin asumir que el contenedor sea un objeto. */
function readField(params: unknown, field: string): unknown {
  if (typeof params !== 'object' || params === null) return undefined;

  return Reflect.get(params, field);
}
