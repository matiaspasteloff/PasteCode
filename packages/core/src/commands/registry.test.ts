import { describe, expect, it, vi } from 'vitest';

import { PasteCodeError } from '../errors/pastecode-error.js';

import { CommandRegistry, type Command } from './registry.js';

/** Un comando mínimo, con handler espiable. */
function commandOf(id: string, handler: Command['handler'] = vi.fn()): Command {
  return { id, title: `command.${id}`, handler };
}

describe('register', () => {
  it('registra un comando y lo devuelve por id', () => {
    const registry = new CommandRegistry();
    const command = commandOf('file.save');

    registry.register(command);

    expect(registry.get('file.save')).toBe(command);
  });

  it('rechaza un id repetido en vez de sobrescribir en silencio', () => {
    // Si dos extensiones eligen el mismo id, lo correcto es avisar: con la
    // sobrescritura, la primera deja de funcionar y nadie se entera.
    const registry = new CommandRegistry();
    registry.register(commandOf('file.save'));

    expect(() => {
      registry.register(commandOf('file.save'));
    }).toThrow(expect.objectContaining({ code: 'DUPLICATE_COMMAND' }));
  });

  it('permite volver a registrar después de dar de baja', () => {
    const registry = new CommandRegistry();
    registry.register(commandOf('file.save'));
    registry.unregister('file.save');

    expect(() => {
      registry.register(commandOf('file.save'));
    }).not.toThrow();
  });

  it('ignora dar de baja un id que no existe', () => {
    const registry = new CommandRegistry();

    expect(() => {
      registry.unregister('no.existe');
    }).not.toThrow();
  });
});

describe('execute', () => {
  it('llama al handler con los argumentos', async () => {
    const handler = vi.fn();
    const registry = new CommandRegistry();
    registry.register(commandOf('file.open', handler));

    await registry.execute('file.open', 'C:\\p\\a.ts');

    expect(handler).toHaveBeenCalledWith('C:\\p\\a.ts');
  });

  it('devuelve undefined cuando el comando sale bien', async () => {
    const registry = new CommandRegistry();
    registry.register(commandOf('file.save'));

    await expect(registry.execute('file.save')).resolves.toBeUndefined();
  });

  it('espera a un handler asíncrono', async () => {
    let finished = false;
    const registry = new CommandRegistry();
    registry.register(
      commandOf('file.save', async () => {
        await Promise.resolve();
        finished = true;
      })
    );

    await registry.execute('file.save');

    expect(finished).toBe(true);
  });

  it('devuelve UNKNOWN_COMMAND si el id no existe', async () => {
    const registry = new CommandRegistry();

    const failure = await registry.execute('no.existe');

    expect(failure?.code).toBe('UNKNOWN_COMMAND');
  });

  it('captura lo que lance el handler en vez de propagarlo', async () => {
    // Un comando que falla no puede tumbar la UI: en la Etapa 5 los handlers
    // van a venir de extensiones de terceros (RF-907).
    const registry = new CommandRegistry();
    registry.register(
      commandOf('roto', () => {
        throw new TypeError('boom');
      })
    );

    const failure = await registry.execute('roto');

    expect(failure?.code).toBe('COMMAND_FAILED');
  });

  it('captura también el rechazo de un handler asíncrono', async () => {
    const registry = new CommandRegistry();
    registry.register(commandOf('roto', () => Promise.reject(new Error('boom'))));

    expect((await registry.execute('roto'))?.code).toBe('COMMAND_FAILED');
  });

  it('conserva el código de un PasteCodeError del handler', async () => {
    // Si el handler ya dijo qué salió mal y cómo contarlo, no hay que taparlo
    // con un mensaje genérico.
    const registry = new CommandRegistry();
    registry.register(
      commandOf('roto', () => {
        throw new PasteCodeError('nope', 'ALGO_PUNTUAL', 'Pasó algo puntual.');
      })
    );

    const failure = await registry.execute('roto');

    expect(failure?.code).toBe('ALGO_PUNTUAL');
    expect(failure?.userMessage).toBe('Pasó algo puntual.');
  });
});

describe('list', () => {
  it('devuelve los comandos en orden de registro', () => {
    const registry = new CommandRegistry();
    registry.register(commandOf('b'));
    registry.register(commandOf('a'));

    expect(registry.list().map((command) => command.id)).toEqual(['b', 'a']);
  });

  it('arranca vacío', () => {
    expect(new CommandRegistry().list()).toEqual([]);
  });
});
