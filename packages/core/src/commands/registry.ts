import { PasteCodeError } from '../errors/pastecode-error.js';

/**
 * Un comando registrado.
 *
 * Es el contrato de [05-modelo-de-datos](../../../../docs/05-modelo-de-datos.md#contrato-de-comandos).
 * El `title` es una **clave de i18n**, no el texto: quien lo muestra lo
 * traduce. Guardar el texto ya traducido acá haría que un comando registrado
 * por una extensión no pudiera traducirse nunca.
 */
export interface Command {
  /** Identificador único, formato `namespace.acción`. */
  id: string;
  /** Clave de i18n del título que se ve en la paleta. */
  title: string;
  /** Categoría para agrupar. Opcional, también clave de i18n. */
  category?: string;
  /** Expresión de contexto que determina si está disponible. */
  when?: string;
  /** Handler. Puede ser async. Los errores se capturan y se devuelven. */
  handler: (...args: unknown[]) => void | Promise<void>;
}

/** Se intentó registrar un `id` que ya existía. */
export class DuplicateCommandError extends PasteCodeError {
  constructor(id: string) {
    super(
      `Command already registered: ${id}`,
      'DUPLICATE_COMMAND',
      `Ya hay un comando registrado con el identificador "${id}".`
    );
  }
}

/** Se intentó ejecutar un `id` que no existe. */
export class UnknownCommandError extends PasteCodeError {
  constructor(id: string) {
    super(
      `Unknown command: ${id}`,
      'UNKNOWN_COMMAND',
      `El comando "${id}" no existe o todavía no se registró.`
    );
  }
}

/**
 * Registro de comandos.
 *
 * Es una clase y no un módulo con estado —a diferencia del registro de modelos
 * de Monaco— porque en la Etapa 5 va a haber más de uno: el host de
 * extensiones necesita su propio registro para poder desmontar de una todos
 * los comandos de una extensión que se descarga.
 *
 * @example
 * const registry = new CommandRegistry();
 * registry.register({ id: 'file.save', title: 'command.save', handler: save });
 * await registry.execute('file.save');
 */
export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  /**
   * Registra un comando.
   *
   * Registrar dos veces el mismo `id` es un **error** y no una sobrescritura
   * silenciosa: cuando dos extensiones eligen el mismo identificador, lo que
   * hay que hacer es avisar, no que gane la última en cargar y que la otra
   * deje de funcionar sin explicación.
   *
   * @param command El comando a registrar.
   * @throws {DuplicateCommandError} Si el `id` ya estaba tomado.
   * @example
   * registry.register({ id: 'file.save', title: 'command.save', handler: save });
   */
  register(command: Command): void {
    if (this.commands.has(command.id)) throw new DuplicateCommandError(command.id);

    this.commands.set(command.id, command);
  }

  /**
   * Da de baja un comando. Ignora los `id` que no existen.
   *
   * @param id Identificador del comando.
   * @example
   * registry.unregister('file.save');
   */
  unregister(id: string): void {
    this.commands.delete(id);
  }

  /**
   * Ejecuta un comando y **captura lo que lance**.
   *
   * Un comando que falla no puede tumbar la UI: en la Etapa 5 los handlers van
   * a venir de extensiones de terceros, y una extensión con un bug no puede
   * dejar el IDE inutilizable ([RF-907](../../../../docs/03-requerimientos-funcionales.md)).
   * Por eso devuelve el error en vez de propagarlo.
   *
   * @param id Identificador del comando.
   * @param args Argumentos para el handler.
   * @returns `undefined` si salió bien, o el error si algo falló.
   * @example
   * const failure = await registry.execute('file.save');
   * if (failure !== undefined) mostrarError(failure);
   */
  async execute(id: string, ...args: unknown[]): Promise<PasteCodeError | undefined> {
    const command = this.commands.get(id);
    if (command === undefined) return new UnknownCommandError(id);

    try {
      await command.handler(...args);
      return undefined;
    } catch (cause) {
      if (cause instanceof PasteCodeError) return cause;

      return new PasteCodeError(
        `Command "${id}" threw`,
        'COMMAND_FAILED',
        `El comando "${command.title}" falló.`,
        { cause }
      );
    }
  }

  /**
   * Todos los comandos registrados, en orden de registro.
   *
   * @returns La lista de comandos.
   * @example
   * registry.list().map((command) => command.id);
   */
  list(): readonly Command[] {
    return [...this.commands.values()];
  }

  /**
   * Un comando por `id`, o `undefined`.
   *
   * @param id Identificador del comando.
   * @returns El comando, si existe.
   * @example
   * registry.get('file.save')?.title;
   */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }
}
