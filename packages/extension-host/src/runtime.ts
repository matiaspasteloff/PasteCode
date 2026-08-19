import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ExtensionModule } from '@pastecode/extension-api';

import type { ActivationTrigger } from './activation.js';
import { matchesActivation } from './activation.js';
import type { ApiContext, EditorSnapshot } from './api.js';
import { createExtensionApi, forgetExtensionCommands } from './api.js';
import type { RpcEndpoint } from './rpc.js';
import type { DiscoveredExtension, ExtensionFailure } from './scan.js';
import { scanExtensions } from './scan.js';

/** En qué estado quedó una extensión después de mirarla. */
export type ExtensionState = 'inactive' | 'active' | 'failed';

/** Lo que el host le reporta al main sobre una extensión. */
export interface ExtensionReport {
  name: string;
  displayName: string;
  version: string;
  state: ExtensionState;
  /** Por qué falló, si falló. */
  reason?: string;
}

/** El runtime del host: qué hay cargado y cómo se activa. */
export interface ExtensionRuntime {
  /** Escanea los directorios y activa lo que responda a `onStartupFinished`. */
  load(directories: readonly string[]): Promise<ExtensionReport[]>;
  /** Activa lo que responda a un trigger. Una ya activa no se vuelve a activar. */
  activate(trigger: ActivationTrigger): Promise<void>;
  /** Anota el editor activo nuevo y avisa a quien esté escuchando. */
  setActiveEditor(editor: EditorSnapshot | null): void;
  /** El estado de ahora, para reportarlo sin volver a escanear. */
  report(): ExtensionReport[];
}

/** Una extensión descubierta, con lo que el runtime le fue agregando. */
interface Tracked {
  readonly found: DiscoveredExtension;
  state: ExtensionState;
  reason?: string;
}

/** Todo lo que el runtime va cambiando. */
interface RuntimeState {
  readonly rpc: RpcEndpoint;
  readonly tracked: Map<string, Tracked>;
  readonly editorListeners: Set<() => void>;
  activeEditor: EditorSnapshot | null;
  failures: readonly ExtensionFailure[];
}

/**
 * Crea el runtime de extensiones del host.
 *
 * Es lo único de este paquete que **ejecuta código de terceros**, y por eso
 * todo lo que hace está envuelto: un `activate` que lanza deja a esa extensión
 * en `failed` y no toca a las demás, que es
 * [RF-902](../../../docs/03-requerimientos-funcionales.md) aplicado al momento
 * de activar y no sólo al de validar el manifest. Un crash de verdad —un
 * `process.exit` adentro de un módulo— no lo puede atrapar nadie desde acá: de
 * eso se ocupa la supervisión del main (RF-907).
 *
 * @param rpc El canal contra el main, que es quien tiene la autoridad.
 * @returns El runtime, todavía sin escanear nada.
 * @example
 * const runtime = createExtensionRuntime(endpoint);
 * await runtime.load([bundledDir, userDir]);
 */
export function createExtensionRuntime(rpc: RpcEndpoint): ExtensionRuntime {
  const state: RuntimeState = {
    rpc,
    tracked: new Map(),
    editorListeners: new Set(),
    activeEditor: null,
    failures: [],
  };

  return {
    load: (directories) => load(state, directories),
    activate: (trigger) => activate(state, trigger),

    setActiveEditor(editor) {
      state.activeEditor = editor;

      // Copia antes de recorrer: un listener que se da de baja adentro de su
      // propia notificación mutaría el Set que se está iterando.
      for (const listener of [...state.editorListeners]) listener();
    },

    report: () => report(state),
  };
}

/** Escanea, anota lo encontrado y activa lo que arranca con el IDE. */
async function load(
  state: RuntimeState,
  directories: readonly string[]
): Promise<ExtensionReport[]> {
  const scanned = await scanExtensions(directories);

  state.failures = scanned.failures;
  state.tracked.clear();

  for (const found of scanned.extensions) {
    state.tracked.set(found.manifest.name, { found, state: 'inactive' });
  }

  await activate(state, { kind: 'startupFinished' });

  return report(state);
}

/** Activa todo lo que responda al trigger y todavía no esté activo. */
async function activate(state: RuntimeState, trigger: ActivationTrigger): Promise<void> {
  for (const entry of state.tracked.values()) {
    if (entry.state !== 'inactive') continue;
    if (!matchesActivation(entry.found.manifest.activationEvents, trigger)) continue;

    await activateOne(state, entry);
  }
}

/** Importa el módulo de una extensión y llama a su `activate`. */
async function activateOne(state: RuntimeState, entry: Tracked): Promise<void> {
  const { manifest, root } = entry.found;

  // Una extensión sin `main` no tiene nada que activar: es un tema, que
  // contribuye sin ejecutar código. Queda `inactive` y eso es correcto.
  if (manifest.main === undefined) return;

  try {
    const module = await importExtension(root, manifest.main);

    await module.activate(createExtensionApi(contextFor(state, manifest.name)));

    entry.state = 'active';
    delete entry.reason;
  } catch (cause) {
    entry.state = 'failed';
    entry.reason = String(cause);
    // Lo que alcanzó a registrar antes de romperse no queda colgado.
    forgetExtensionCommands(manifest.name);
  }
}

/** El contexto que recibe la API de una extensión dada. */
function contextFor(state: RuntimeState, extension: string): ApiContext {
  return {
    extension,
    rpc: state.rpc,
    activeEditor: () => state.activeEditor,
    onEditorChanged: (listener) => {
      state.editorListeners.add(listener);

      return () => state.editorListeners.delete(listener);
    },
  };
}

/** El estado de todo lo que se miró, cargado o no. */
function report(state: RuntimeState): ExtensionReport[] {
  const loaded = [...state.tracked.values()].map((entry): ExtensionReport => ({
    name: entry.found.manifest.name,
    displayName: entry.found.manifest.displayName,
    version: entry.found.manifest.version,
    state: entry.state,
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  }));

  // Las que ni siquiera llegaron a tener un manifest válido también se
  // reportan: RF-902 pide error **visible**, y una extensión que desaparece de
  // la lista sin decir nada no es visible.
  const broken = state.failures.map((failure): ExtensionReport => ({
    name: failure.root,
    displayName: failure.root,
    version: '',
    state: 'failed',
    reason: failure.reason,
  }));

  return [...loaded, ...broken];
}

/**
 * Si lo que devolvió el `import()` tiene la forma que el host espera.
 *
 * Es un type predicate y no una aserción porque esto es un límite del sistema
 * de verdad: del otro lado hay un módulo de terceros del que no se sabe nada
 * hasta mirarlo. La regla 2 de `codigo.md` prohíbe el `as`; verificar y después
 * afirmar es lo que la reemplaza.
 */
function isExtensionModule(value: unknown): value is ExtensionModule {
  if (typeof value !== 'object' || value === null) return false;
  if (!('activate' in value) || typeof value.activate !== 'function') return false;

  // `deactivate` es opcional, pero si está tiene que ser llamable: una
  // extensión que exporta `deactivate: true` es un bug que conviene ver al
  // cargar y no durante el cierre del IDE.
  if (!('deactivate' in value)) return true;

  return typeof value.deactivate === 'function' || value.deactivate === undefined;
}

/**
 * Importa el módulo de una extensión.
 *
 * El `import()` va sobre una URL `file://` y no sobre la ruta cruda: en Windows
 * un `import('C:\\...')` interpreta la letra de unidad como un protocolo y
 * falla con un mensaje que no dice eso.
 *
 * @throws {Error} Si el módulo no se puede importar o no exporta `activate`.
 */
async function importExtension(root: string, main: string): Promise<ExtensionModule> {
  const entry = pathToFileURL(join(root, main)).href;
  const loaded: unknown = await import(entry);

  if (!isExtensionModule(loaded)) {
    throw new Error('El módulo de la extensión no exporta un "activate" llamable');
  }

  return loaded;
}
