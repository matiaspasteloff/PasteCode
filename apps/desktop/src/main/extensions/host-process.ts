import { join } from 'node:path';

import type { UtilityProcess } from 'electron';
import { utilityProcess } from 'electron';

/** Cuánto se espera el `pong` antes de dar el arranque por fallido. */
const HANDSHAKE_TIMEOUT_MS = 5000;

/** Lo que el host contesta al handshake. */
interface HostHandshake {
  nodeVersion: string;
  pid: number;
}

/** Un host vivo, ya saludado. */
export interface ExtensionHost {
  process: UtilityProcess;
  handshake: HostHandshake;
}

/**
 * La ruta del bundle del host.
 *
 * Se resuelve contra `__dirname` y no contra `app.getAppPath()` a propósito:
 * los dos entries de tipo `main` salen al mismo directorio, así que el host
 * está siempre al lado del que lo forkea, empaquetado o no. Es lo que hace que
 * la ruta sea la misma en `pnpm dev`, en el E2E sobre `out/` y adentro del
 * `.asar`, sin una rama por entorno.
 */
function hostEntry(): string {
  return join(__dirname, 'extension-host.js');
}

/**
 * Forkea el extension host y espera su saludo.
 *
 * **`utilityProcess.fork` y no `child_process.fork`.** El de Electron es el que
 * sabe leer un módulo de adentro del `.asar` —para `child_process` el asar es
 * un archivo binario cualquiera— y el que da un `MessagePort` en vez de un
 * canal de IPC de Node. Ver
 * [ADR-0027](../../../../../docs/adr/0027-empaquetado-y-fork-del-extension-host.md).
 *
 * El handshake no es ceremonia: un `fork` que devuelve un objeto no significa
 * que del otro lado haya un proceso capaz de ejecutar algo. Si el bundle no se
 * pudo resolver —el caso que este spike existe para descartar—, el proceso
 * arranca y muere sin decir nada, y sin esperar el `pong` eso se vería mucho
 * más tarde, como un RPC que no contesta.
 *
 * @returns El proceso y lo que contestó.
 * @throws {Error} Si no saluda antes del timeout, o si muere en el intento.
 * @example
 * const host = await forkExtensionHost();
 */
export async function forkExtensionHost(): Promise<ExtensionHost> {
  const child = utilityProcess.fork(hostEntry(), [], {
    // Sin `stdio: 'pipe'` la salida del host se pierde. Es el único lugar donde
    // se va a ver un error de una extensión de terceros antes de que exista el
    // protocolo, así que se hereda para que caiga en el log del main.
    stdio: 'inherit',
    serviceName: 'pastecode-extension-host',
  });

  return new Promise<ExtensionHost>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      child.kill();
      reject(new Error('El extension host no contestó el handshake'));
    }, HANDSHAKE_TIMEOUT_MS);

    function cleanup(): void {
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('exit', onExit);
    }

    function onMessage(message: unknown): void {
      const handshake = readHandshake(message);
      if (handshake === undefined) return;

      cleanup();
      resolve({ process: child, handshake });
    }

    function onExit(code: number): void {
      cleanup();
      reject(new Error(`El extension host murió durante el arranque (código ${String(code)})`));
    }

    child.on('message', onMessage);
    child.on('exit', onExit);

    // El ping va después de suscribirse y no antes: el `spawn` es asincrónico,
    // pero `postMessage` sobre un proceso que todavía no arrancó se encola, y
    // suscribirse tarde sí perdería la respuesta.
    child.postMessage({ kind: 'ping' });
  });
}

/** El `pong` del host, o `undefined` si el mensaje es otra cosa. */
function readHandshake(message: unknown): HostHandshake | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  if (!('kind' in message) || message.kind !== 'pong') return undefined;
  if (!('nodeVersion' in message) || typeof message.nodeVersion !== 'string') return undefined;
  if (!('pid' in message) || typeof message.pid !== 'number') return undefined;

  return { nodeVersion: message.nodeVersion, pid: message.pid };
}
