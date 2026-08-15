import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/command-store.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { resetEditorStore, tabsWith } from '../../test-support/editor-state.js';

import { useKeybindings } from './use-keybindings.js';

/** Componente mínimo cuyo único trabajo es instalar el listener. */
function KeybindingHost(): React.JSX.Element {
  useKeybindings();

  return <div data-testid="host" />;
}

const run = vi.fn();
const openPalette = vi.fn();

beforeEach(() => {
  run.mockClear();
  openPalette.mockClear();
  resetEditorStore();
  useCommandStore.setState({ run, openPalette, isPaletteOpen: false });
});

describe('useKeybindings', () => {
  it('dispara el comando de guardar con Ctrl+S', async () => {
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}s{/Control}');

    expect(run).toHaveBeenCalledWith('file.save');
  });

  it('abre la paleta con Ctrl+Shift+P', async () => {
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');

    expect(openPalette).toHaveBeenCalled();
    // La paleta no pasa por el registro de comandos: abrirla desde la paleta
    // misma no tendría sentido.
    expect(run).not.toHaveBeenCalled();
  });

  it('no cierra la pestaña con Ctrl+W si no hay ninguna abierta', async () => {
    // Es el `when` en acción: `hasOpenTab` es falso sin pestañas.
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}w{/Control}');

    expect(run).not.toHaveBeenCalled();
  });

  it('cierra la pestaña con Ctrl+W cuando hay una abierta', async () => {
    useEditorStore.setState({ tabs: tabsWith(['C:\\p\\a.ts']) });
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}w{/Control}');

    expect(run).toHaveBeenCalledWith('file.closeTab');
  });

  it('ignora una tecla sin atajo asociado', async () => {
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}q{/Control}');
    await userEvent.keyboard('a');

    expect(run).not.toHaveBeenCalled();
  });

  it('ignora pulsar sólo un modificador', async () => {
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}{/Control}');

    expect(run).not.toHaveBeenCalled();
  });
});
