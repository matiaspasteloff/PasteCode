import type {
  Disposable,
  PasteCode,
  StatusBarItem,
  StatusBarItemOptions,
  TextEditor,
} from '@pastecode/extension-api';

import { MAIN_METHODS } from './protocol.js';
import type { RpcEndpoint } from './rpc.js';

/** Lo que la instantánea del editor activo trae por el canal. */
export interface EditorSnapshot {
  path: string;
  languageId: string;
  version: number;
}

/** Lo que el host necesita para fabricarle su API a una extensión. */
export interface ApiContext {
  /** El `name` del manifest. Va en cada llamada: es lo que el main atribuye. */
  readonly extension: string;
  readonly rpc: RpcEndpoint;
  /** El editor activo de ahora, empujado por el main. Puede cambiar. */
  readonly activeEditor: () => EditorSnapshot | null;
  /** Se suscribe a los cambios del editor activo. Devuelve con qué cortar. */
  readonly onEditorChanged: (listener: () => void) => () => void;
}

/**
 * Los handlers de comando registrados, por extensión e id.
 *
 * Es un mapa de módulo y no un campo de cada API porque quien los busca es el
 * despachador del host, que recibe un `runCommand` con el par extensión/id y no
 * tiene a mano el objeto de esa extensión.
 */
const commandHandlers = new Map<
  string,
  (...args: readonly unknown[]) => void | Promise<void>
>();

/** La clave con la que se guarda un handler. */
function commandKey(extension: string, id: string): string {
  return `${extension} ${id}`;
}

/**
 * Corre el handler de un comando registrado por una extensión.
 *
 * @param extension El `name` del manifest de quien lo registró.
 * @param id El comando a correr.
 * @param args Lo que llegó de quien lo ejecutó.
 * @throws {Error} Si el comando no está registrado en este host.
 * @example
 * await runRegisteredCommand('word-count', 'wordCount.toggle', []);
 */
export async function runRegisteredCommand(
  extension: string,
  id: string,
  args: readonly unknown[]
): Promise<void> {
  const handler = commandHandlers.get(commandKey(extension, id));

  if (handler === undefined) throw new Error(`El comando "${id}" no está registrado`);

  await handler(...args);
}

/**
 * Olvida todo lo que registró una extensión que se descarga.
 *
 * El main da de baja su mitad por su cuenta —ya tiene la atribución—, así que
 * esto es sólo la mitad del host: los handlers, que son lo único que el main no
 * puede soltar porque son funciones que viven en este proceso.
 *
 * @param extension El `name` del manifest.
 * @example
 * forgetExtensionCommands('word-count');
 */
export function forgetExtensionCommands(extension: string): void {
  const prefix = `${extension} `;

  for (const key of [...commandHandlers.keys()]) {
    if (key.startsWith(prefix)) commandHandlers.delete(key);
  }
}

/**
 * Fabrica el objeto `pastecode` de **una** extensión.
 *
 * Uno por extensión y no uno compartido: el `extension` queda cerrado adentro
 * de cada llamada, así que una extensión no puede hacerse pasar por otra sin
 * fabricarse sus propios mensajes, y si los fabrica el main igual la valida
 * contra el manifest de quien realmente los mandó. Ver
 * [ADR-0025](../../../docs/adr/0025-forma-de-la-api-de-extensiones.md).
 *
 * Acá **no** se verifica ninguna capability. La verificación vive en el main,
 * que es el único proceso que la puede hacer cumplir: éste es el proceso donde
 * corre el código de terceros, así que un chequeo de este lado lo escribiría el
 * mismo que se lo quiere saltear.
 *
 * @param context La extensión, su canal y el editor activo.
 * @returns El objeto que recibe `activate`.
 * @example
 * const pastecode = createExtensionApi({ extension: 'word-count', rpc, ... });
 */
export function createExtensionApi(context: ApiContext): PasteCode {
  return {
    commands: {
      async registerCommand(id, handler) {
        await context.rpc.request(MAIN_METHODS.registerCommand, {
          extension: context.extension,
          id,
        });

        commandHandlers.set(commandKey(context.extension, id), handler);

        return {
          dispose: async () => {
            commandHandlers.delete(commandKey(context.extension, id));
            await context.rpc.request(MAIN_METHODS.unregisterCommand, {
              extension: context.extension,
              id,
            });
          },
        };
      },

      async executeCommand(id, ...args) {
        await context.rpc.request(MAIN_METHODS.executeCommand, {
          extension: context.extension,
          id,
          args,
        });
      },
    },

    window: windowFor(context),
  };
}

/** La mitad `window` de la API. */
function windowFor(context: ApiContext): PasteCode['window'] {
  return {
    get activeTextEditor(): TextEditor | undefined {
      return editorFor(context);
    },

    onDidChangeActiveTextEditor(listener): Promise<Disposable> {
      const stop = context.onEditorChanged(() => {
        listener(editorFor(context));
      });

      return Promise.resolve({
        dispose: () => {
          stop();

          return Promise.resolve();
        },
      });
    },

    createStatusBarItem: (options) => createStatusBarItem(context, options),
  };
}

/** La instantánea del editor activo, o `undefined` si no hay ninguno. */
function editorFor(context: ApiContext): TextEditor | undefined {
  const snapshot = context.activeEditor();

  if (snapshot === null) return undefined;

  return {
    document: {
      path: snapshot.path,
      languageId: snapshot.languageId,
      version: snapshot.version,

      getText: async () => {
        const text = await context.rpc.request(MAIN_METHODS.getDocumentText, {
          extension: context.extension,
          path: snapshot.path,
        });

        return typeof text === 'string' ? text : '';
      },
    },

    edit: async (edits) => {
      const applied = await context.rpc.request(MAIN_METHODS.applyEdits, {
        extension: context.extension,
        path: snapshot.path,
        // La versión contra la que se leyó. Si el documento se movió, el main
        // no aplica nada y contesta `false`: la alternativa es pisar lo que
        // alguien acaba de escribir.
        version: snapshot.version,
        edits,
      });

      return applied === true;
    },
  };
}

/** Crea un ítem de la status bar y devuelve su fachada. */
async function createStatusBarItem(
  context: ApiContext,
  options?: StatusBarItemOptions
): Promise<StatusBarItem> {
  const created = await context.rpc.request(MAIN_METHODS.createStatusBarItem, {
    extension: context.extension,
    options: options ?? {},
  });

  const itemId = typeof created === 'string' ? created : '';

  const update = async (patch: Record<string, unknown>): Promise<void> => {
    await context.rpc.request(MAIN_METHODS.updateStatusBarItem, {
      extension: context.extension,
      itemId,
      patch,
    });
  };

  return {
    setText: (text) => update({ text }),
    setTooltip: (tooltip) => update({ tooltip }),
    setCommand: (commandId) => update({ command: commandId }),
    show: () => update({ visible: true }),
    hide: () => update({ visible: false }),

    dispose: async () => {
      await context.rpc.request(MAIN_METHODS.disposeStatusBarItem, {
        extension: context.extension,
        itemId,
      });
    },
  };
}
