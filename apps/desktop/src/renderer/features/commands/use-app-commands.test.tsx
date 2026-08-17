import { CommandRegistry } from '@pastecode/core';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useCommandStore } from '../../stores/command-store.js';

import { useAppCommands } from './use-app-commands.js';

/** Componente mínimo cuyo único trabajo es registrar los comandos. */
function CommandHost(): React.JSX.Element {
  useAppCommands();

  return <div data-testid="host" />;
}

beforeEach(() => {
  useCommandStore.setState({ registry: new CommandRegistry(), revision: 0 });
});

describe('useAppCommands', () => {
  it('registra los comandos de la app', () => {
    render(<CommandHost />);

    const ids = useCommandStore
      .getState()
      .registry.list()
      .map((command) => command.id);

    expect(ids).toContain('workspace.open');
    expect(ids).toContain('terminal.toggle');
  });

  it('sobrevive al doble montaje de StrictMode', () => {
    // La regresión concreta: sin la baja en la limpieza del efecto, el segundo
    // montaje que hace StrictMode en desarrollo volvía a registrar
    // `workspace.open`, el registro lanzaba `DuplicateCommandError` y la app
    // quedaba en blanco con `pnpm dev`. En producción no se veía, porque ahí
    // StrictMode no duplica los efectos.
    expect(() =>
      render(
        <StrictMode>
          <CommandHost />
        </StrictMode>
      )
    ).not.toThrow();

    // Y queda uno solo de cada uno, no dos ni cero.
    const ids = useCommandStore
      .getState()
      .registry.list()
      .map((command) => command.id);

    expect(ids.filter((id) => id === 'workspace.open')).toHaveLength(1);
  });

  it('da de baja los comandos al desmontar', () => {
    const { unmount } = render(<CommandHost />);
    unmount();

    expect(useCommandStore.getState().registry.list()).toHaveLength(0);
  });
});
