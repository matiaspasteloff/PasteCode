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
 * **`terminal.shell` es la excepción:** el workspace no puede elegirlo. Un
 * `.pastecode/settings.json` viaja adentro de cualquier repositorio que se
 * clone, y clonar no puede ser lo mismo que aceptar ejecutar lo que el
 * repositorio diga. Ver [seguridad.md](../../../../docs/convenciones/seguridad.md#procesos-hijo-y-binarios-externos).
 *
 * @param user Lo leído de `~/.pastecode/settings.json`.
 * @param workspace Lo leído de `<raíz>/.pastecode/settings.json`.
 * @returns Las settings efectivas, completas.
 * @example
 * resolveSettings({ editor: { fontSize: 16 } }, { editor: { tabSize: 4 } });
 * // editor.fontSize 16, editor.tabSize 4, el resto por defecto
 */
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

  return {
    editor: Object.assign({}, DEFAULT_SETTINGS.editor, user.editor, workspace.editor),
    files: Object.assign({}, DEFAULT_SETTINGS.files, user.files, workspace.files),
    terminal: {
      ...terminal,
      // Se pisa **después** de todo: es lo que hace que el valor del workspace
      // no pueda ganar, sin depender de que alguien se acuerde de borrarlo.
      shell: user.terminal?.shell ?? DEFAULT_SETTINGS.terminal.shell,
    },
    window: Object.assign({}, DEFAULT_SETTINGS.window, user.window, workspace.window),
  };
}
