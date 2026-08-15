import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

// Las funciones del editor: buscar, plegar, multi-cursor, deshacer, comentar.
// Sin esto, `editor.api` sola da un textarea glorificado.
import 'monaco-editor/features/register.all';

// Las 81 gramáticas Monarch. Es lo que cumple RF-101 —15+ lenguajes
// resaltados— sin dependencias nuevas ni código propio.
//
// `definitions/register.all` y no `languages/register.all`: el segundo, además
// de las gramáticas, reexporta los *servicios* de lenguaje. Ver abajo.
import 'monaco-editor/languages/definitions/register.all';

/**
 * Configuración del entorno de Monaco.
 *
 * Monaco levanta web workers para lo que no puede bloquear al hilo de la UI:
 * el cálculo de diffs, la detección de links y las sugerencias por palabra.
 * Bajo `file://` esto era imposible —origen opaco, Chromium se niega— y es la
 * razón por la que el renderer se sirve desde un esquema propio
 * ([ADR-0012](../../../../../../docs/adr/0012-servir-el-renderer-desde-un-protocolo-propio.md)).
 *
 * El worker se importa con `?worker`, que hace que Vite lo emita como un
 * archivo aparte **del mismo origen**. La otra variante, `?worker&inline`, lo
 * mete en un `blob:`, y el spike de este PR verificó que `default-src 'self'`
 * bloquea los blobs con `worker-src <- blob`.
 *
 * **Cada import está elegido, y el que falta también.** Tanto el punto de
 * entrada raíz del paquete como `languages/register.all` arrastran los
 * *servicios* de lenguaje de TypeScript, CSS, HTML y JSON, y cada uno viene
 * con su worker: 13,3MB el de TypeScript, 1,9MB el de CSS, 18MB entre los
 * cuatro. Esta etapa sólo necesita resaltado —el autocompletado real llega por
 * LSP en la Etapa 4—, así que serían 18MB de instalador (RNF-05) por workers
 * que ni siquiera se instancian, porque `getWorker` devuelve siempre el
 * genérico. `definitions/register.all` trae las mismas gramáticas sin ellos.
 *
 * Sobre los especificadores: el `exports` de monaco-editor mapea `./*` a
 * `./esm/vs/*.js`, así que el prefijo `esm/vs/` que aparece en casi todos los
 * ejemplos de internet ya está incluido y ponerlo lo duplica. La 0.56 además
 * reorganizó el paquete: `editor.all.js` y `basic-languages/` ya no existen.
 */
globalThis.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export { monaco };
