import { join } from 'node:path';

import type { RpcEndpoint } from '@pastecode/extension-host';
import { createRpcEndpoint, HOST_METHODS } from '@pastecode/extension-host';
import type {
  ExtensionHostChangedEvent,
  ExtensionsChangedEvent,
} from '@pastecode/ipc-contract';
import { ExtensionInfoSchema, ExtensionThemeSchema } from '@pastecode/ipc-contract';
import { utilityProcess } from 'electron';

import { logProcess } from '../services/logger.js';
import type { UtilityProcessHandle } from '../supervisors/adapters/utility-handle.js';
import { adaptUtilityProcess } from '../supervisors/adapters/utility-handle.js';
import { createSupervisedProcess } from '../supervisors/supervised-process.js';

import type { ExtensionBroker } from './broker.js';
import { extensionDirectories } from './directories.js';

/** Cuánto se le da al host para irse por las buenas antes de matarlo. */
const SHUTDOWN_GRACE_MS = 2000;

/** El host supervisado, visto por el resto del main. */
export interface ExtensionHostService {
  /** Lo lanza. Idempotente. */
  start(): void;
  /** El estado resuelto, para `extensions:getStatus`. */
  status(): ExtensionHostChangedEvent;
  /** Lo que hay cargado, para `extensions:list`. */
  extensions(): ExtensionsChangedEvent;
  /** La punta del protocolo contra el host vivo. */
  rpc(): RpcEndpoint;
  /**
   * Le avisa al host qué documento está activo y republica lo que reporte.
   *
   * El aviso puede **despertar** extensiones —`onLanguage:` se cumple recién
   * cuando hay un documento de ese lenguaje a la vista—, así que el estado de
   * después no es el de antes. Sin republicar, la lista quedaría diciendo
   * `inactive` sobre una extensión que ya está corriendo.
   */
  notifyActiveEditor(payload: unknown): Promise<void>;
  /** Lo apaga a propósito. Un apagado deliberado no reinicia nada. */
  stop(): Promise<void>;
}

/** Cómo se arma el servicio. */
export interface ExtensionHostServiceConfig {
  /** Se llama cada vez que cambia el estado, para emitir `extensions:hostChanged`. */
  readonly onStatusChanged?: (status: ExtensionHostChangedEvent) => void;
  /** Se llama con la lista resuelta después de cada carga. */
  readonly onExtensionsChanged?: (extensions: ExtensionsChangedEvent) => void;
  /**
   * El broker, que es quien atiende lo que el host pide.
   *
   * Llega por parámetro y no se crea acá porque su ciclo de vida es más largo
   * que el de un host: sobrevive a los reinicios, y lo que cambia en cada uno
   * es contra qué endpoint está enganchado.
   */
  readonly broker?: ExtensionBroker;
}

/**
 * La ruta del bundle del host.
 *
 * Se resuelve contra `__dirname` y no contra `app.getAppPath()` a propósito:
 * los dos entries de tipo `main` salen al mismo directorio, así que el host
 * está siempre al lado del que lo forkea, empaquetado o no. Es lo que hace que
 * la ruta sea la misma en `pnpm dev`, en el E2E sobre `out/` y adentro del
 * `.asar`, sin una rama por entorno. Ver
 * [ADR-0027](../../../../../docs/adr/0027-empaquetado-y-fork-del-extension-host.md).
 */
function hostEntry(): string {
  return join(__dirname, 'extension-host.js');
}

/**
 * Forkea el host. Es lo que el supervisor vuelve a llamar en cada reinicio.
 *
 * **`utilityProcess.fork` y no `child_process.fork`.** El de Electron es el que
 * sabe leer un módulo de adentro del `.asar` —para `child_process` el asar es
 * un archivo binario cualquiera— y el que da un `MessagePort` en vez de un
 * canal de IPC de Node.
 */
function spawnHost(): UtilityProcessHandle {
  return adaptUtilityProcess(
    utilityProcess.fork(hostEntry(), [], {
      // Sin `stdio: 'inherit'` la salida del host se pierde, y ahí es donde va
      // a aparecer lo que escriba una extensión de terceros.
      stdio: 'inherit',
      serviceName: 'pastecode-extension-host',
    })
  );
}

/**
 * Todo lo que cambia a lo largo de la vida del host.
 *
 * Mismo criterio que la `Supervision` de
 * [`supervised-process`](../supervisors/supervised-process.ts): el ciclo
 * —arrancar, saludar, morir, reenchufar— escrito adentro de la fábrica no entra
 * en las 50 líneas por función de RNF-20.
 */
interface HostState {
  readonly config: ExtensionHostServiceConfig;
  state: ExtensionHostChangedEvent['state'];
  restarts: number;
  /** Lo último que el host reportó. Se vacía cuando el host muere. */
  extensions: ExtensionsChangedEvent;
  endpoint: RpcEndpoint;
  /** El proceso vivo, o `null`. Lo llena `attach` y lo vacía la salida. */
  handle: UtilityProcessHandle | null;
}

/**
 * Crea el extension host supervisado.
 *
 * Reúsa `createSupervisedProcess` —el mismo que ya levantan el PTY y el cliente
 * de LSP— con la política de reinicio de
 * [RNF-09](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad):
 * tres intentos con backoff y después se rinde. Que el host se rinda **no**
 * tumba el IDE: se queda sin extensiones y sigue andando, que es lo que pide
 * [RF-907](../../../../../docs/03-requerimientos-funcionales.md).
 *
 * @param config A quién avisarle de los cambios de estado.
 * @returns El servicio. Todavía sin lanzar.
 * @example
 * const host = createExtensionHostService({ onStatusChanged: emit });
 * host.start();
 */
export function createExtensionHostService(
  config: ExtensionHostServiceConfig = {}
): ExtensionHostService {
  const host: HostState = {
    config,
    state: 'starting',
    restarts: 0,
    extensions: { extensions: [], themes: [] },
    endpoint: createRpcEndpoint({ send: () => undefined }),
    handle: null,
  };

  const supervisor = createSupervisedProcess<UtilityProcessHandle>({
    name: 'extension-host',
    spawn: spawnHost,
    requestGracefulExit: (handle) => requestShutdown(host, handle),
    onExit: () => {
      // Se rechaza todo lo pendiente **acá** y no al reiniciar: entre que el
      // host muere y que el reintento arranca pasa el backoff entero, y quien
      // esté esperando merece enterarse ahora y no dentro de un segundo.
      host.endpoint.dispose('el extension host murió');
      host.handle = null;
      // Lo que las extensiones habían aportado murió con el proceso.
      host.config.broker?.reset();
      // La lista se vacía: lo que estaba activo murió con el proceso, y
      // mostrarlo como activo mientras el host reinicia sería mentir.
      publishExtensions(host, { extensions: [], themes: [] });
      publish(host, 'restarting');
    },
    onRestart: (handle) => {
      host.restarts += 1;
      attach(host, handle);
    },
    onGiveUp: () => {
      publish(host, 'gaveUp');
    },
  });

  return {
    start() {
      const handle = supervisor.start();

      if (handle === null) return;

      publish(host, 'starting');
      attach(host, handle);
    },

    status: () => statusOf(host),
    extensions: () => host.extensions,
    rpc: () => host.endpoint,
    notifyActiveEditor: (payload) => notifyActiveEditor(host, payload),

    async stop() {
      await supervisor.stop(SHUTDOWN_GRACE_MS);
      host.endpoint.dispose('el extension host se apagó');
    },
  };
}

/**
 * Enchufa un endpoint nuevo contra un host recién nacido y espera su saludo.
 *
 * El endpoint se rehace en cada arranque a propósito. Reusarlo dejaría las
 * llamadas en vuelo del host anterior esperando una respuesta que nadie va a
 * mandar; el `dispose` de la salida las rechaza a todas, y el host nuevo
 * empieza con su propia numeración.
 */
function attach(host: HostState, handle: UtilityProcessHandle): void {
  host.handle = handle;
  host.endpoint = createRpcEndpoint({
    send: (message) => {
      handle.postMessage(message);
    },
  });

  handle.onMessage((message) => {
    host.endpoint.receive(message);
  });

  // El broker se engancha antes del saludo: el host puede empezar a registrar
  // comandos apenas active su primera extensión, y un método sin handler le
  // contestaría UNKNOWN_METHOD.
  host.config.broker?.attach(host.endpoint);

  // El saludo no es ceremonia: un `fork` que devuelve un objeto no significa
  // que del otro lado haya un proceso capaz de ejecutar algo. Si el bundle no
  // se pudo resolver, el proceso arranca y muere sin decir nada, y sin
  // preguntar eso se vería mucho más tarde, como un RPC que no contesta.
  host.endpoint
    .request(HOST_METHODS.ready)
    .then(async () => {
      publish(host, 'ready');
      await loadExtensions(host);
    })
    .catch(() => {
      // No se publica nada: el `exit` que viene detrás es quien manda, y
      // adelantarse acá pintaría un `restarting` que el supervisor todavía no
      // decidió.
      handle.forceKill();
    });
}

/**
 * Le pide al host que escanee y active, y publica lo que reporte.
 *
 * Un error acá **no** mata al host: que el escaneo falle deja al IDE sin
 * extensiones, que es un estado peor pero perfectamente usable, y es
 * exactamente la promesa de [RF-902](../../../../../docs/03-requerimientos-funcionales.md).
 */
async function loadExtensions(host: HostState): Promise<void> {
  try {
    const reported = await host.endpoint.request(HOST_METHODS.loadExtensions, {
      directories: extensionDirectories(),
    });

    const extensions = readExtensions(readField(reported, 'extensions'));
    const themes = readThemes(readField(reported, 'themes'));

    // Las capabilities primero: el broker las necesita para dejar actuar a
    // cualquiera de las que acaban de activarse.
    host.config.broker?.grant(
      extensions.map((entry) => ({ name: entry.name, capabilities: entry.capabilities }))
    );
    publishExtensions(host, { extensions, themes });
  } catch (cause) {
    logProcess('unhealthy', 'extension-host', { reason: `carga fallida: ${String(cause)}` });
  }
}

/**
 * Le pasa el documento activo al host y republica lo que haya cambiado.
 *
 * Un fallo acá se traga: significa que el host no está, y el editor va a
 * seguir cambiando, así que el próximo aviso lo alcanza.
 */
async function notifyActiveEditor(host: HostState, payload: unknown): Promise<void> {
  const reported = await host.endpoint
    .request(HOST_METHODS.activeEditorChanged, payload)
    .catch(() => null);

  if (reported === null) return;

  const extensions = readExtensions(reported);

  // Sólo se republica si de verdad cambió algo: sin esta comparación, cada
  // cambio de pestaña emitiría un evento hacia el renderer sin novedad adentro.
  if (JSON.stringify(extensions) === JSON.stringify(host.extensions.extensions)) return;

  publishExtensions(host, { extensions, themes: host.extensions.themes });
}

/**
 * Valida lo que reportó el host antes de publicarlo.
 *
 * Del otro lado del canal corre código de terceros, así que lo que llega es
 * `unknown` hasta que un schema diga otra cosa — el mismo criterio que ya aplica
 * cualquier canal del IPC. Una entrada malformada se descarta en vez de tumbar
 * la lista entera.
 */
function readExtensions(reported: unknown): ExtensionsChangedEvent['extensions'] {
  if (!Array.isArray(reported)) return [];

  return reported.flatMap((entry: unknown) => {
    const parsed = ExtensionInfoSchema.safeParse(entry);

    return parsed.success ? [parsed.data] : [];
  });
}

/** Ídem para los temas aportados. */
function readThemes(reported: unknown): ExtensionsChangedEvent['themes'] {
  if (!Array.isArray(reported)) return [];

  return reported.flatMap((entry: unknown) => {
    const parsed = ExtensionThemeSchema.safeParse(entry);

    return parsed.success ? [parsed.data] : [];
  });
}

/** Saca un campo sin asumir que lo reportado sea un objeto. */
function readField(reported: unknown, field: string): unknown {
  if (typeof reported !== 'object' || reported === null) return undefined;

  return Reflect.get(reported, field);
}

/** Anota la lista y avisa. */
function publishExtensions(host: HostState, next: ExtensionsChangedEvent): void {
  host.extensions = next;
  host.config.onExtensionsChanged?.(next);
}

/**
 * Le pide al host que se apague por su propio protocolo.
 *
 * Un `utilityProcess` no acepta señales, así que el pedido amable **es** el
 * protocolo. Si no contesta, `ManagedProcess` pasa a `forceKill` cuando se
 * agota la gracia; un host matado sin avisar deja las extensiones sin su
 * `deactivate`.
 */
async function requestShutdown(host: HostState, handle: UtilityProcessHandle): Promise<void> {
  await host.endpoint.request(HOST_METHODS.shutdown).catch(() => undefined);
  handle.terminate();
}

/** Anota el estado y avisa. */
function publish(host: HostState, next: ExtensionHostChangedEvent['state']): void {
  host.state = next;
  host.config.onStatusChanged?.(statusOf(host));
}

/** El estado resuelto de ahora. */
function statusOf(host: HostState): ExtensionHostChangedEvent {
  return { state: host.state, pid: host.handle?.pid ?? null, restarts: host.restarts };
}
