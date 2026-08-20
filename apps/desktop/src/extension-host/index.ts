import {
  createExtensionRuntime,
  createRpcEndpoint,
  HOST_METHODS,
  runRegisteredCommand,
} from '@pastecode/extension-host';

/**
 * Punto de entrada del extension host.
 *
 * Corre en un `utilityProcess` de Electron: un proceso Node aparte, sin acceso
 * al DOM y sin la superficie de Electron. Es el proceso donde corre código de
 * terceros, y todo lo que este archivo hace —y sobre todo lo que no hace— está
 * pensado para eso.
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
 * Este archivo es **sólo el cableado**: el protocolo, el loader y el runtime
 * viven en `@pastecode/extension-host`, que no importa Electron y por eso se
 * puede testear sin lanzar un proceso.
 */

const endpoint = createRpcEndpoint({
  send: (message) => {
    process.parentPort.postMessage(message);
  },
});

const runtime = createExtensionRuntime(endpoint);

/**
 * El saludo del arranque.
 *
 * Devuelve la versión de Node y el pid porque son las dos cosas que prueban lo
 * que hay que probar: que del otro lado hay un Node vivo, y que **no** es el
 * proceso del main.
 */
endpoint.handle(HOST_METHODS.ready, () => ({
  nodeVersion: process.versions.node,
  pid: process.pid,
}));

/**
 * Escanea y activa. Lo dispara el main cuando sabe dónde mirar.
 *
 * Los directorios los elige el main y no el host: son
 * `resources/extensions/` y `~/.pastecode/extensions/`
 * ([RF-901](../../../../docs/03-requerimientos-funcionales.md)), y cuál es cada
 * uno depende de si la app está empaquetada y de si hay un directorio de datos
 * forzado para los tests. Nada de eso lo sabe este proceso, y dárselo a
 * adivinar sería darle a código de terceros una forma de opinar sobre dónde se
 * busca código de terceros.
 */
endpoint.handle(HOST_METHODS.loadExtensions, async (params) => {
  const directories = readStringArray(params, 'directories');

  return runtime.load(directories);
});

/** Corre un comando de una extensión. Lo pide el main cuando alguien lo ejecuta. */
endpoint.handle(HOST_METHODS.runCommand, async (params) => {
  const extension = readString(params, 'extension');
  const id = readString(params, 'id');
  const args = readUnknownArray(params, 'args');

  await runRegisteredCommand(extension, id, args);

  return null;
});

/**
 * El editor activo cambió.
 *
 * Trae `path`, `languageId` y `version`, **nunca el texto**: si el evento
 * arrastrara el contenido, cada tecla serían dos saltos de proceso con el
 * archivo entero adentro. Ver ADR-0026.
 */
endpoint.handle(HOST_METHODS.activeEditorChanged, async (params) => {
  const editor = readEditor(params);

  runtime.setActiveEditor(editor);

  // Un documento abierto es un activation event: `onLanguage:markdown` se
  // cumple recién cuando hay un markdown a la vista (RF-908).
  if (editor !== null) {
    await runtime.activate({ kind: 'language', languageId: editor.languageId });
  }

  // Se devuelve el estado y no `null`: el aviso pudo haber despertado
  // extensiones, y el main necesita republicar la lista para que no siga
  // diciendo `inactive` sobre algo que ya está corriendo.
  return runtime.report();
});

/**
 * El apagado por las buenas.
 *
 * Contesta **antes** de salir: si el proceso se fuera adentro del handler,
 * quien lo pidió se quedaría esperando hasta el timeout una respuesta que ya
 * no puede llegar. El `setImmediate` deja que la respuesta salga por el canal
 * y recién después termina.
 */
endpoint.handle(HOST_METHODS.shutdown, () => {
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

/** Un campo string de los params, o lanza. El error vuelve como respuesta. */
function readString(params: unknown, field: string): string {
  const value = readField(params, field);

  if (typeof value !== 'string') throw new Error(`El parámetro "${field}" no es un string`);

  return value;
}

/** Un campo de array de strings, o lanza. */
function readStringArray(params: unknown, field: string): string[] {
  const value = readField(params, field);

  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`El parámetro "${field}" no es un array de strings`);
  }

  return value;
}

/** Un campo de array cualquiera. Los argumentos de un comando son opacos. */
function readUnknownArray(params: unknown, field: string): unknown[] {
  const value = readField(params, field);

  return Array.isArray(value) ? value : [];
}

/** La instantánea del editor activo que mandó el main, o `null`. */
function readEditor(
  params: unknown
): { path: string; languageId: string; version: number } | null {
  const value = readField(params, 'editor');

  if (typeof value !== 'object' || value === null) return null;

  const path: unknown = Reflect.get(value, 'path');
  const languageId: unknown = Reflect.get(value, 'languageId');
  const version: unknown = Reflect.get(value, 'version');

  if (
    typeof path !== 'string' ||
    typeof languageId !== 'string' ||
    typeof version !== 'number'
  ) {
    return null;
  }

  return { path, languageId, version };
}

/** Saca un campo de los params sin asumir que los params sean un objeto. */
function readField(params: unknown, field: string): unknown {
  if (typeof params !== 'object' || params === null) return undefined;

  return Reflect.get(params, field);
}
