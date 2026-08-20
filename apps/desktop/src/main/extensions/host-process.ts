import { join } from 'node:path';

import type { RpcEndpoint } from '@pastecode/extension-host';
import { createRpcEndpoint } from '@pastecode/extension-host';
import type { ExtensionHostChangedEvent } from '@pastecode/ipc-contract';
import { utilityProcess } from 'electron';

import type { UtilityProcessHandle } from '../supervisors/adapters/utility-handle.js';
import { adaptUtilityProcess } from '../supervisors/adapters/utility-handle.js';
import { createSupervisedProcess } from '../supervisors/supervised-process.js';

/** Cuánto se le da al host para irse por las buenas antes de matarlo. */
const SHUTDOWN_GRACE_MS = 2000;

/** El método con el que el host confirma que está vivo y listo. */
const READY_METHOD = 'host/ready';

/** El método con el que se le pide al host que se apague por las buenas. */
const SHUTDOWN_METHOD = 'host/shutdown';

/** El host supervisado, visto por el resto del main. */
export interface ExtensionHostService {
  /** Lo lanza. Idempotente. */
  start(): void;
  /** El estado resuelto, para `extensions:getStatus`. */
  status(): ExtensionHostChangedEvent;
  /** La punta del protocolo contra el host vivo. */
  rpc(): RpcEndpoint;
  /** Lo apaga a propósito. Un apagado deliberado no reinicia nada. */
  stop(): Promise<void>;
}

/** Cómo se arma el servicio. */
export interface ExtensionHostServiceConfig {
  /** Se llama cada vez que cambia el estado, para emitir `extensions:hostChanged`. */
  readonly onStatusChanged?: (status: ExtensionHostChangedEvent) => void;
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
    rpc: () => host.endpoint,

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

  // El saludo no es ceremonia: un `fork` que devuelve un objeto no significa
  // que del otro lado haya un proceso capaz de ejecutar algo. Si el bundle no
  // se pudo resolver, el proceso arranca y muere sin decir nada, y sin
  // preguntar eso se vería mucho más tarde, como un RPC que no contesta.
  host.endpoint
    .request(READY_METHOD)
    .then(() => {
      publish(host, 'ready');
    })
    .catch(() => {
      // No se publica nada: el `exit` que viene detrás es quien manda, y
      // adelantarse acá pintaría un `restarting` que el supervisor todavía no
      // decidió.
      handle.forceKill();
    });
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
  await host.endpoint.request(SHUTDOWN_METHOD).catch(() => undefined);
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
