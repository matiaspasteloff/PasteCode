import type { Disposable } from './disposable.js';

/**
 * Lo que corre cuando se ejecuta un comando.
 *
 * Los argumentos son `unknown` y no un genérico porque llegan del otro lado de
 * dos saltos de proceso: lo que la extensión recibe es lo que sobrevivió al
 * structured clone, y prometerle un tipo sería prometerle algo que nadie
 * verificó. Narrowing del lado de la extensión, como con cualquier entrada.
 */
export type CommandHandler = (...args: readonly unknown[]) => void | Promise<void>;

/** Comandos: registrarlos y ejecutarlos. */
export interface CommandsNamespace {
  /**
   * Registra un comando y lo publica en la paleta.
   *
   * Es el criterio de aceptación de [RF-903](../../../docs/03-requerimientos-funcionales.md)
   * tal cual está escrito. El `id` tiene que coincidir con un
   * `contributes.commands[].command` del manifest: el manifest es lo que se
   * puede leer sin ejecutar la extensión, así que es lo que permite mostrar el
   * comando en la paleta antes de que la extensión se active — que es
   * justamente lo que hace posible el activation event `onCommand:`.
   *
   * @param id Identificador único, formato `namespace.acción`.
   * @param handler Se llama con los argumentos de quien lo ejecute.
   * @returns Con qué darlo de baja antes de que se descargue la extensión.
   * @throws Si el `id` ya estaba registrado, o si no está en el manifest.
   * @example
   * await pastecode.commands.registerCommand('wordCount.toggle', toggle);
   */
  registerCommand(id: string, handler: CommandHandler): Promise<Disposable>;

  /**
   * Ejecuta un comando, sea de esta extensión, de otra o del IDE.
   *
   * Resuelve cuando el handler terminó. Si el comando no existe o el handler
   * lanza, rechaza: para quien llama es indistinguible de una función normal
   * que falló, que es lo que hace que valga la pena esperarla.
   *
   * @param id El comando a ejecutar.
   * @param args Argumentos, que tienen que ser serializables.
   * @example
   * await pastecode.commands.executeCommand('editor.save');
   */
  executeCommand(id: string, ...args: readonly unknown[]): Promise<void>;
}
