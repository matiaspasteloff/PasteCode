/**
 * Punto de entrada del extension host.
 *
 * Corre en un `utilityProcess` de Electron: un proceso Node aparte, sin acceso
 * al DOM y sin la superficie de Electron. Es el proceso donde va a correr
 * código de terceros, y todo lo que este archivo hace —y sobre todo lo que no
 * hace— está pensado para eso.
 *
 * **El canal es `process.parentPort`, no el `parentPort` de
 * `node:worker_threads`.** Los dos se llaman igual y no son lo mismo: el de
 * `worker_threads` sirve dentro de un *hilo*, y un `utilityProcess` es un
 * *proceso*, así que ahí vale `null` y el host queda mudo sin ningún error que
 * mirar. Lo encontró el spike S1, y no lo encontró empaquetado: fallaba igual
 * en desarrollo.
 *
 * De paso, `process.parentPort` no requiere importar `electron`. Un
 * `require('electron')` acá le daría a una extensión acceso a `app`, `shell` y
 * `dialog` desde dentro de su propio proceso, que es justo lo que
 * [ADR-0003](../../../../docs/adr/0003-extension-host-aislado.md) evita.
 *
 * Se compila como un segundo entry de tipo `main` en `electron.vite.config.ts`,
 * así que queda en `out/main/extension-host.js` y viaja adentro del asar como
 * cualquier otro módulo del main. Ver
 * [ADR-0027](../../../../docs/adr/0027-empaquetado-y-fork-del-extension-host.md).
 */

/** Lo mínimo que el host entiende hasta que llegue el protocolo del paso 32b. */
interface HandshakeMessage {
  kind: 'ping';
}

/** Lo que contesta. */
interface HandshakeReply {
  kind: 'pong';
  /** La versión de Node del host. Confirma que del otro lado hay un Node vivo. */
  nodeVersion: string;
  /** El pid, para poder afirmar en un test que **no** es el del main. */
  pid: number;
}

/**
 * Si un mensaje cualquiera es el ping del handshake.
 *
 * Se valida aunque venga del main: el día que este proceso reciba mensajes de
 * más de un origen la validación ya está donde tiene que estar, y un `unknown`
 * sin narrowing es lo que la regla 3 de `CLAUDE.md` prohíbe.
 */
function isHandshake(message: unknown): message is HandshakeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'kind' in message &&
    message.kind === 'ping'
  );
}

process.parentPort.on('message', (event) => {
  // El payload viene adentro de `.data`: `parentPort` entrega un
  // `MessageEvent`, no el mensaje pelado. Es la otra mitad de la misma
  // confusión con `worker_threads`, donde el listener recibe el valor directo.
  if (!isHandshake(event.data)) return;

  const reply: HandshakeReply = {
    kind: 'pong',
    nodeVersion: process.versions.node,
    pid: process.pid,
  };

  process.parentPort.postMessage(reply);
});
