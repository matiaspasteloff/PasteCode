import type { Settings, SettingsFile } from './schema.js';
import { DEFAULT_SETTINGS } from './schema.js';

/**
 * Resuelve las settings efectivas a partir de las dos capas de archivo.
 *
 * La precedencia es la de [RF-705](../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración):
 * defaults → usuario → workspace. Es una función pura y las capas entran por
 * parámetro: quien lee los archivos es el main, y esto se testea sin disco.
 *
 * **Semántica del merge, que conviene fijar por escrito porque no es obvia:**
 *
 * - **Los objetos se combinan por grupo.** Poner `editor.fontSize` en el
 *   workspace no borra el `editor.tabSize` del usuario.
 * - **Los arrays se reemplazan enteros, no se concatenan.** Es la decisión que
 *   más se discute y la razón es `files.exclude`: si concatenara, un workspace
 *   no tendría **ninguna forma** de dejar de excluir algo que el usuario
 *   excluyó globalmente. Reemplazar deja las dos operaciones disponibles
 *   —agregar es repetir la lista con un ítem más—; concatenar deja una sola.
 *
 * **Las claves que eligen un ejecutable son la excepción:** el workspace no
 * puede setearlas. Son `terminal.shell`, `lsp.serverPaths`, `git.path` y
 * `debug.adapterPath`. Un
 * `.pastecode/settings.json` viaja adentro de cualquier repositorio que se
 * clone, y clonar no puede ser lo mismo que aceptar ejecutar lo que el
 * repositorio diga. Con el LSP la apuesta sube: elegir el ejecutable de un
 * servidor de lenguaje es elegir **qué se ejecuta al abrir un `.py`**, sin que
 * nadie haya hecho click en nada.
 * Ver [seguridad.md](../../../../docs/convenciones/seguridad.md#procesos-hijo-y-binarios-externos).
 *
 * @param user Lo leído de `~/.pastecode/settings.json`.
 * @param workspace Lo leído de `<raíz>/.pastecode/settings.json`.
 * @returns Las settings efectivas, completas.
 * @example
 * resolveSettings({ editor: { fontSize: 16 } }, { editor: { tabSize: 4 } });
 * // editor.fontSize 16, editor.tabSize 4, el resto por defecto
 */
/**
 * Las claves de `debug` que **sólo** el usuario puede escribir.
 *
 * Están juntas en su propia función y no esparcidas en `resolveSettings` para
 * que la regla de seguridad se lea de una vez: elegir el adaptador es elegir
 * *qué se ejecuta al apretar F5*, y elegir sus argumentos es casi lo mismo —un
 * `--eval` sobre un adaptador legítimo alcanza para ejecutar código—.
 *
 * `requestTimeoutMs` **no** está acá a propósito: no elige ningún ejecutable, y
 * un repositorio con un adaptador lento tiene un motivo legítimo para pedir más
 * tiempo.
 */
function userOnlyDebug(
  user: SettingsFile
): Pick<Settings['debug'], 'adapterPath' | 'adapterArgs'> {
  return {
    adapterPath: user.debug?.adapterPath ?? DEFAULT_SETTINGS.debug.adapterPath,
    adapterArgs: user.debug?.adapterArgs ?? DEFAULT_SETTINGS.debug.adapterArgs,
  };
}

export function resolveSettings(user: SettingsFile, workspace: SettingsFile): Settings {
  // `Object.assign` y no el spread por una razón de tipos, no de estilo: con
  // `exactOptionalPropertyTypes`, esparcir un `Partial<T>` sobre un `T` deja
  // cada campo como `T | undefined`, porque el compilador no sabe que las
  // claves ausentes no existen. El tipo de `Object.assign` es la intersección,
  // que conserva lo obligatorio de la base. En runtime son lo mismo: Zod omite
  // las claves ausentes en vez de ponerlas en `undefined`.
  const terminal = Object.assign(
    {},
    DEFAULT_SETTINGS.terminal,
    user.terminal,
    workspace.terminal
  );

  const debug = Object.assign({}, DEFAULT_SETTINGS.debug, user.debug, workspace.debug);
  const git = Object.assign({}, DEFAULT_SETTINGS.git, user.git, workspace.git);
  const lsp = Object.assign({}, DEFAULT_SETTINGS.lsp, user.lsp, workspace.lsp);

  return {
    debug: { ...debug, ...userOnlyDebug(user) },
    editor: Object.assign({}, DEFAULT_SETTINGS.editor, user.editor, workspace.editor),
    files: Object.assign({}, DEFAULT_SETTINGS.files, user.files, workspace.files),
    git: {
      ...git,
      path: user.git?.path ?? DEFAULT_SETTINGS.git.path,
    },
    lsp: {
      ...lsp,
      // El mapa entero, no clave por clave: dejar que el workspace agregue
      // **una** entrada sería dejar que elija el ejecutable de ese lenguaje,
      // que es exactamente lo que la regla prohíbe.
      serverPaths: user.lsp?.serverPaths ?? DEFAULT_SETTINGS.lsp.serverPaths,
    },
    terminal: {
      ...terminal,
      // Se pisa **después** de todo: es lo que hace que el valor del workspace
      // no pueda ganar, sin depender de que alguien se acuerde de borrarlo.
      shell: user.terminal?.shell ?? DEFAULT_SETTINGS.terminal.shell,
    },
    window: Object.assign({}, DEFAULT_SETTINGS.window, user.window, workspace.window),
  };
}
