import type { ExtensionContributionsEvent } from '@pastecode/ipc-contract';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useExtensionsStore } from '../../stores/extensions-store.js';

import { StatusExtensions } from './StatusExtensions.js';

/** Un ítem de la barra aportado por una extensión, con lo mínimo. */
type StatusItem = ExtensionContributionsEvent['statusItems'][number];

/** Uno con lo mínimo, para no repetir el objeto en cada caso. */
function item(overrides: Partial<StatusItem> = {}): StatusItem {
  return {
    extension: 'word-count',
    itemId: 'uno',
    text: '6 palabras',
    alignment: 'right',
    priority: 10,
    ...overrides,
  };
}

beforeEach(() => {
  useExtensionsStore.getState().setStatusItems([]);
});

describe('StatusExtensions', () => {
  it('no dibuja nada cuando ninguna extensión aporta un ítem', () => {
    const { container } = render(<StatusExtensions />);

    // Un contenedor vacío en la barra es un hueco que empuja al resto.
    expect(container.firstChild).toBeNull();
  });

  it('muestra el texto del ítem', () => {
    useExtensionsStore.getState().setStatusItems([item()]);

    render(<StatusExtensions />);

    expect(screen.getByTestId('status-extension-word-count').textContent).toBe('6 palabras');
  });

  it('sin comando es un texto y no un botón', () => {
    useExtensionsStore.getState().setStatusItems([item()]);

    render(<StatusExtensions />);

    // Un botón que no hace nada es peor que un texto: se anuncia como
    // accionable y recibe el foco para nada (RNF-23).
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('con comando es un botón alcanzable con el teclado', () => {
    useExtensionsStore.getState().setStatusItems([item({ command: 'wordCount.toggle' })]);

    render(<StatusExtensions />);

    expect(screen.getByRole('button', { name: '6 palabras' })).not.toBeNull();
  });

  it('dibuja los de varias extensiones a la vez', () => {
    useExtensionsStore
      .getState()
      .setStatusItems([item(), item({ extension: 'otra', itemId: 'dos', text: 'algo' })]);

    render(<StatusExtensions />);

    expect(screen.getByTestId('status-extension-word-count')).not.toBeNull();
    expect(screen.getByTestId('status-extension-otra')).not.toBeNull();
  });
});
