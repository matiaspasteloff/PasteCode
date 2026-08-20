import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/command-store.js';

import { syncCommands } from './sync-commands.js';

/** Un comando aportado, con lo mínimo. */
function contributed(id: string, extension = 'word-count') {
  return { extension, id, title: id };
}

/** Los ids que quedaron en el registro, ordenados. */
function registeredIds(): string[] {
  return useCommandStore
    .getState()
    .registry.list()
    .map((command) => command.id)
    .sort();
}

beforeEach(() => {
  for (const { id } of useCommandStore.getState().registry.list()) {
    useCommandStore.getState().unregister(id);
  }
});

describe('syncCommands', () => {
  it('registra los comandos aportados, con prefijo', () => {
    syncCommands([contributed('wordCount.toggle')]);

    // Sin prefijo, una extensión podría registrar `file.save` y quedarse con el
    // atajo de guardar.
    expect(registeredIds()).toEqual(['ext:wordCount.toggle']);
  });

  it('el mismo lote dos veces no lanza y deja lo mismo', () => {
    // **Es la regresión.** El evento llega una vez por cada cambio de
    // contribución y trae el estado resuelto, así que el mismo comando vuelve a
    // aparecer. Registrarlo de nuevo lanzaba `DuplicateCommandError`, la
    // excepción se comía el resto del listener, y el síntoma era la status bar
    // congelada en su primer valor.
    const lote = [contributed('wordCount.toggle')];

    syncCommands(lote);

    expect(() => {
      syncCommands(lote);
    }).not.toThrow();
    expect(registeredIds()).toEqual(['ext:wordCount.toggle']);
  });

  it('da de baja lo que la extensión dejó de aportar', () => {
    syncCommands([contributed('a.uno'), contributed('a.dos')]);
    syncCommands([contributed('a.uno')]);

    expect(registeredIds()).toEqual(['ext:a.uno']);
  });

  it('no toca los comandos de fábrica', () => {
    useCommandStore.getState().register({
      id: 'file.save',
      title: 'command.save',
      handler: () => undefined,
    });

    syncCommands([contributed('a.uno')]);
    syncCommands([]);

    // Sólo se dan de baja los que llevan el prefijo: barrer el registro entero
    // dejaría al IDE sin sus propios comandos.
    expect(registeredIds()).toEqual(['file.save']);
  });

  it('conserva la categoría cuando la hay', () => {
    syncCommands([{ ...contributed('a.uno'), category: 'Word Count' }]);

    expect(useCommandStore.getState().registry.list()[0]?.category).toBe('Word Count');
  });

  it('ejecutar el comando pasa por el main con su extensión', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, value: {} });

    // Sólo `pastecode`: esparcir el `window` de jsdom perdería el prototipo de
    // sus instancias, y lo único que este test necesita es el canal.
    vi.stubGlobal('pastecode', { invoke });
    Object.defineProperty(globalThis.window, 'pastecode', {
      value: { invoke },
      configurable: true,
    });

    syncCommands([contributed('wordCount.toggle', 'word-count')]);
    await useCommandStore.getState().run('ext:wordCount.toggle');

    expect(invoke).toHaveBeenCalledWith('extensions:executeCommand', {
      extension: 'word-count',
      id: 'wordCount.toggle',
    });

    vi.unstubAllGlobals();
  });
});
