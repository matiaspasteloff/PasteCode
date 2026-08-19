import { CommandRegistry } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

/**
 * La regresión que encontró el E2E de `word-count`.
 *
 * `extensions:contributionsChanged` llega **una vez por cada cambio de
 * contribución**, y el payload trae el estado resuelto: una extensión que
 * actualiza su ítem de la barra republica también sus comandos. Volver a
 * registrar lo que ya estaba lanza `DuplicateCommandError`, la excepción se come
 * el resto del listener, y la status bar queda congelada en su primer valor.
 *
 * El síntoma no se parece en nada a la causa, así que el test vive acá: lo que
 * hay que fijar es que registrar dos veces el mismo lote sea inofensivo.
 */
describe('el registro tolera que el mismo lote llegue dos veces', () => {
  it('lanza si se registra un id repetido, que es la trampa', () => {
    const registry = new CommandRegistry();

    registry.register({ id: 'ext:a.b', title: 'a.b', handler: () => undefined });

    expect(() => {
      registry.register({ id: 'ext:a.b', title: 'a.b', handler: () => undefined });
    }).toThrow();
  });

  it('registrar sólo lo que falta deja el mismo registro dos veces seguidas', () => {
    const registry = new CommandRegistry();

    /** Lo que hace `syncCommands`: dar de baja lo que sobra, agregar lo que falta. */
    const sync = (wanted: readonly string[]): void => {
      const ids = new Set(wanted);

      for (const { id } of registry.list()) {
        if (!ids.has(id)) registry.unregister(id);
      }

      const present = new Set(registry.list().map((command) => command.id));

      for (const id of wanted) {
        if (!present.has(id)) registry.register({ id, title: id, handler: () => undefined });
      }
    };

    sync(['ext:a.b', 'ext:c.d']);
    sync(['ext:a.b', 'ext:c.d']);

    expect(
      registry
        .list()
        .map((command) => command.id)
        .sort()
    ).toEqual(['ext:a.b', 'ext:c.d']);
  });

  it('da de baja lo que la extensión dejó de aportar', () => {
    const registry = new CommandRegistry();

    registry.register({ id: 'ext:a.b', title: 'a.b', handler: () => undefined });
    registry.register({ id: 'ext:c.d', title: 'c.d', handler: () => undefined });

    for (const { id } of registry.list()) {
      if (id !== 'ext:a.b') registry.unregister(id);
    }

    expect(registry.list().map((command) => command.id)).toEqual(['ext:a.b']);
  });
});
