import { createRpcEndpoint } from '@pastecode/extension-host';

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
 *
 * Este archivo es **sólo el cableado**: el protocolo vive en
 * `@pastecode/extension-host`, que no importa Electron y por eso se puede
 * testear sin lanzar un proceso.
 */

const endpoint = createRpcEndpoint({
  send: (message) => {
    process.parentPort.postMessage(message);
  },
});

/**
 * El saludo del arranque.
 *
 * Devuelve la versión de Node y el pid porque son las dos cosas que prueban lo
 * que hay que probar: que del otro lado hay un Node vivo, y que **no** es el
 * proceso del main.
 */
endpoint.handle('host/ready', () => ({
  nodeVersion: process.versions.node,
  pid: process.pid,
}));

/**
 * El apagado por las buenas.
 *
 * Contesta **antes** de salir: si el proceso se fuera adentro del handler,
 * quien lo pidió se quedaría esperando hasta el timeout una respuesta que ya
 * no puede llegar. El `setImmediate` deja que la respuesta salga por el canal
 * y recién después termina.
 */
endpoint.handle('host/shutdown', () => {
  setImmediate(() => {
    process.exit(0);
  });

  return null;
});

process.parentPort.on('message', (event) => {
  // El payload viene adentro de `.data`: `parentPort` entrega un
  // `MessageEvent`, no el mensaje pelado. Es la otra mitad de la misma
  // confusión con `worker_threads`, donde el listener recibe el valor directo.
  endpoint.receive(event.data);
});
