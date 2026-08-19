import type { CommandsNamespace } from './commands.js';
import type { WindowNamespace } from './window.js';

/**
 * Todo lo que una extensión puede hacer.
 *
 * **Llega por parámetro, no por `import`.** VS Code resuelve `import * as
 * vscode` parcheando la resolución de módulos de Node, que es un montón de
 * maquinaria para lograr que un objeto se llame de una manera. Acá el módulo
 * exporta `activate(pastecode)` y el parámetro se llama `pastecode`, así que el
 * código de una extensión se lee igual que el criterio de aceptación de
 * [RF-903](../../../docs/03-requerimientos-funcionales.md) sin resolver falso —
 * y este paquete queda **sólo tipos**, que es lo que la regla 5 de `CLAUDE.md`
 * necesita. Ver ADR-0025.
 *
 * Lo que se recibe está recortado por las `capabilities` del manifest: los
 * namespaces están siempre, y lo que no se declaró rechaza. Se ve como un
 * permiso denegado, no como un método que no existe, para que el error diga qué
 * falta agregar al manifest.
 */
export interface PasteCode {
  readonly commands: CommandsNamespace;
  readonly window: WindowNamespace;
}

/**
 * El arranque de una extensión.
 *
 * Se llama una vez, cuando se cumple alguno de sus `activationEvents`. Si
 * devuelve una `Promise`, el IDE la espera antes de dar la extensión por
 * activada; si rechaza, la extensión queda marcada como fallida y **el resto
 * sigue andando** ([RF-902](../../../docs/03-requerimientos-funcionales.md)).
 *
 * No hay `context.subscriptions`: ver [`Disposable`](./disposable.ts).
 *
 * @example
 * export const activate: Activate = async (pastecode) => {
 *   await pastecode.commands.registerCommand('wordCount.toggle', toggle);
 * };
 */
export type Activate = (pastecode: PasteCode) => void | Promise<void>;

/**
 * El apagado de una extensión.
 *
 * Opcional, y para los recursos *propios* de la extensión —un timer, un
 * archivo abierto—. Lo registrado contra la API lo da de baja el IDE solo.
 * Tiene un techo de tiempo: una extensión que no vuelve no puede demorar el
 * cierre del IDE.
 */
export type Deactivate = () => void | Promise<void>;

/**
 * La forma que el host espera del módulo apuntado por `main`.
 *
 * Lo usa el loader para validar lo que devuelve el `import()` dinámico antes de
 * llamar a nada. Una extensión no necesita nombrarlo: le alcanza con tipar sus
 * exports como [`Activate`](#Activate) y [`Deactivate`](#Deactivate).
 */
export interface ExtensionModule {
  activate: Activate;
  deactivate?: Deactivate;
}
