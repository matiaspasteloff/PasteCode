import { beforeEach, describe, expect, it } from 'vitest';

import type { EditorSnapshot } from './api.js';
import { createExtensionApi, forgetExtensionCommands, runRegisteredCommand } from './api.js';
import { MAIN_METHODS } from './protocol.js';
import type { RpcEndpoint } from './rpc.js';

/** Una llamada que salió por el canal. */
interface Call {
  method: string;
  params: unknown;
}

/**
 * Un endpoint de mentira.
 *
 * Anota lo que sale y contesta lo que se le diga. Es todo lo que hace falta:
 * lo que este archivo verifica es **qué** manda la API, no cómo viaja.
 */
function fakeRpc(reply: (method: string) => unknown = () => null): {
  calls: Call[];
  endpoint: RpcEndpoint;
} {
  const calls: Call[] = [];

  return {
    calls,
    endpoint: {
      request: (method, params) => {
        calls.push({ method, params });

        return Promise.resolve(reply(method));
      },
      handle: () => undefined,
      receive: () => undefined,
      dispose: () => undefined,
      pendingCount: () => 0,
    },
  };
}

/** El contexto mínimo, con el editor que se le pase. */
function contextWith(rpc: RpcEndpoint, editor: EditorSnapshot | null = null) {
  return {
    extension: 'word-count',
    rpc,
    activeEditor: () => editor,
    onEditorChanged: () => () => undefined,
  };
}

beforeEach(() => {
  forgetExtensionCommands('word-count');
});

describe('createExtensionApi', () => {
  describe('comandos', () => {
    it('registra contra el main y corre el handler cuando se lo piden', async () => {
      const { calls, endpoint } = fakeRpc();
      const pastecode = createExtensionApi(contextWith(endpoint));

      let corrio = false;

      await pastecode.commands.registerCommand('wordCount.toggle', () => {
        corrio = true;
      });

      expect(calls[0]?.method).toBe(MAIN_METHODS.registerCommand);
      // El `extension` viaja en cada llamada: es lo que le permite al main
      // verificar la capability y atribuir el registro.
      expect(calls[0]?.params).toEqual({ extension: 'word-count', id: 'wordCount.toggle' });

      await runRegisteredCommand('word-count', 'wordCount.toggle', []);

      expect(corrio).toBe(true);
    });

    it('le pasa al handler los argumentos de quien lo ejecutó', async () => {
      const { endpoint } = fakeRpc();
      const pastecode = createExtensionApi(contextWith(endpoint));
      let recibidos: readonly unknown[] = [];

      await pastecode.commands.registerCommand('wordCount.toggle', (...args) => {
        recibidos = args;
      });
      await runRegisteredCommand('word-count', 'wordCount.toggle', [1, 'dos']);

      expect(recibidos).toEqual([1, 'dos']);
    });

    it('el dispose lo saca del host y del main', async () => {
      const { calls, endpoint } = fakeRpc();
      const pastecode = createExtensionApi(contextWith(endpoint));

      const registro = await pastecode.commands.registerCommand(
        'wordCount.toggle',
        () => undefined
      );

      await registro.dispose();

      expect(calls.at(-1)?.method).toBe(MAIN_METHODS.unregisterCommand);
      await expect(
        runRegisteredCommand('word-count', 'wordCount.toggle', [])
      ).rejects.toThrow();
    });

    it('un comando que no está registrado rechaza en vez de quedarse callado', async () => {
      await expect(runRegisteredCommand('word-count', 'no-existe', [])).rejects.toThrow();
    });

    it('ejecutar un comando ajeno pasa por el main', async () => {
      const { calls, endpoint } = fakeRpc();
      const pastecode = createExtensionApi(contextWith(endpoint));

      await pastecode.commands.executeCommand('editor.save', 'a');

      expect(calls[0]).toEqual({
        method: MAIN_METHODS.executeCommand,
        params: { extension: 'word-count', id: 'editor.save', args: ['a'] },
      });
    });
  });

  describe('documento activo', () => {
    it('es undefined cuando no hay ninguno abierto', () => {
      const { endpoint } = fakeRpc();

      expect(createExtensionApi(contextWith(endpoint)).window.activeTextEditor).toBeUndefined();
    });

    it('expone el metadato sin pedir nada por el canal', () => {
      const { calls, endpoint } = fakeRpc();
      const editor = { path: 'C:\\p\\a.md', languageId: 'markdown', version: 3 };

      const activo = createExtensionApi(contextWith(endpoint, editor)).window.activeTextEditor;

      expect(activo?.document).toMatchObject(editor);
      // Leer el metadato no cuesta un salto de proceso: es lo que el main ya
      // empujó. Lo que cuesta es el texto.
      expect(calls).toEqual([]);
    });

    it('el texto sí se pide, y sólo cuando se lo pide', async () => {
      const { calls, endpoint } = fakeRpc((method) =>
        method === MAIN_METHODS.getDocumentText ? 'hola mundo' : null
      );
      const editor = { path: 'C:\\p\\a.md', languageId: 'markdown', version: 3 };

      const activo = createExtensionApi(contextWith(endpoint, editor)).window.activeTextEditor;

      expect(await activo?.document.getText()).toBe('hola mundo');
      expect(calls[0]?.method).toBe(MAIN_METHODS.getDocumentText);
    });

    it('la edición viaja con la versión contra la que se leyó', async () => {
      const { calls, endpoint } = fakeRpc(() => true);
      const editor = { path: 'C:\\p\\a.md', languageId: 'markdown', version: 7 };
      const activo = createExtensionApi(contextWith(endpoint, editor)).window.activeTextEditor;

      const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };

      expect(await activo?.edit([{ range, newText: 'x' }])).toBe(true);
      // Sin la versión, el main no puede saber si el documento se movió, y
      // aplicar a ciegas es pisar lo que alguien acaba de escribir.
      expect(calls[0]?.params).toMatchObject({ version: 7, path: 'C:\\p\\a.md' });
    });

    it('una edición sobre un documento que ya cambió devuelve false', async () => {
      const { endpoint } = fakeRpc(() => false);
      const editor = { path: 'C:\\p\\a.md', languageId: 'markdown', version: 1 };
      const activo = createExtensionApi(contextWith(endpoint, editor)).window.activeTextEditor;

      expect(await activo?.edit([])).toBe(false);
    });
  });

  describe('status bar', () => {
    it('crea el ítem y manda cada cambio por separado', async () => {
      const { calls, endpoint } = fakeRpc(() => 'item-1');
      const pastecode = createExtensionApi(contextWith(endpoint));

      const item = await pastecode.window.createStatusBarItem({ alignment: 'right' });

      await item.setText('42 palabras');
      await item.show();

      expect(calls[0]?.method).toBe(MAIN_METHODS.createStatusBarItem);
      expect(calls[1]?.params).toEqual({
        extension: 'word-count',
        itemId: 'item-1',
        patch: { text: '42 palabras' },
      });
      expect(calls[2]?.params).toMatchObject({ patch: { visible: true } });
    });

    it('el dispose lo saca de la barra', async () => {
      const { calls, endpoint } = fakeRpc(() => 'item-1');
      const pastecode = createExtensionApi(contextWith(endpoint));

      await (await pastecode.window.createStatusBarItem()).dispose();

      expect(calls.at(-1)?.method).toBe(MAIN_METHODS.disposeStatusBarItem);
    });
  });

  describe('suscripción al editor activo', () => {
    it('llama al listener con la instantánea nueva y se puede cortar', async () => {
      const { endpoint } = fakeRpc();
      const listeners = new Set<() => void>();
      let editor: EditorSnapshot | null = null;

      const pastecode = createExtensionApi({
        extension: 'word-count',
        rpc: endpoint,
        activeEditor: () => editor,
        onEditorChanged: (listener) => {
          listeners.add(listener);

          return () => listeners.delete(listener);
        },
      });

      const vistos: (string | undefined)[] = [];
      const suscripcion = await pastecode.window.onDidChangeActiveTextEditor((activo) => {
        vistos.push(activo?.document.path);
      });

      editor = { path: 'C:\\p\\a.md', languageId: 'markdown', version: 1 };
      for (const listener of listeners) listener();

      await suscripcion.dispose();

      editor = { path: 'C:\\p\\b.md', languageId: 'markdown', version: 1 };
      for (const listener of listeners) listener();

      expect(vistos).toEqual(['C:\\p\\a.md']);
    });
  });
});

describe('forgetExtensionCommands', () => {
  it('sólo olvida los de la extensión que se descarga', async () => {
    const { endpoint } = fakeRpc();

    await createExtensionApi(contextWith(endpoint)).commands.registerCommand(
      'wordCount.toggle',
      () => undefined
    );
    await createExtensionApi({
      ...contextWith(endpoint),
      extension: 'otra',
    }).commands.registerCommand('otra.hacer', () => undefined);

    forgetExtensionCommands('word-count');

    await expect(runRegisteredCommand('word-count', 'wordCount.toggle', [])).rejects.toThrow();
    await expect(runRegisteredCommand('otra', 'otra.hacer', [])).resolves.toBeUndefined();

    forgetExtensionCommands('otra');
  });
});
