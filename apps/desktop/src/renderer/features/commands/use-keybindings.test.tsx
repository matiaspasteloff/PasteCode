import type { Keybinding } from '@pastecode/core';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '../../stores/command-store.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useKeybindingsStore } from '../../stores/keybindings-store.js';
import { groupsWith, resetEditorStore } from '../../test-support/editor-state.js';
import { emitFakeEvent, installFakeApi } from '../../test-support/fake-api.js';

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

  // Desde RF-702 el hook pide los atajos del usuario al montar. Sin archivo, la
  // respuesta es una lista vacía, que es el caso de una instalación nueva.
  installFakeApi({
    'keybindings:get': { ok: true, value: { bindings: [], conflicts: [], error: null } },
  });
  useKeybindingsStore.setState({ bindings: [], conflicts: [], error: null });
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
    useEditorStore.setState({ groups: groupsWith(['C:\\p\\a.ts']) });
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

describe('los atajos del usuario (RF-702)', () => {
  /** Monta el hook con un archivo del usuario ya cargado. */
  async function renderWith(bindings: Keybinding[]): Promise<void> {
    installFakeApi({
      'keybindings:get': { ok: true, value: { bindings, conflicts: [], error: null } },
    });
    render(<KeybindingHost />);

    // El hook pide los atajos al montar. Sin esperar a que la respuesta llegue,
    // la tecla se resolvería contra la lista vacía del estado inicial.
    await waitFor(() => {
      expect(useKeybindingsStore.getState().bindings).toHaveLength(bindings.length);
    });
  }

  it('dispara el comando que el usuario asoció a una tecla', async () => {
    await renderWith([{ key: 'ctrl+k', command: 'file.save' }]);

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(run).toHaveBeenCalledWith('file.save');
  });

  it('deja que el usuario pise un atajo de fábrica', async () => {
    // `ctrl+s` es `file.save` de fábrica. Ante la misma especificidad el
    // resolver se queda con el último, y los del usuario van después.
    await renderWith([{ key: 'ctrl+s', command: 'file.saveAll' }]);

    await userEvent.keyboard('{Control>}s{/Control}');

    expect(run).toHaveBeenCalledWith('file.saveAll');
    expect(run).not.toHaveBeenCalledWith('file.save');
  });

  it('aplica el archivo recargado sin volver a montar nada', async () => {
    await renderWith([]);

    emitFakeEvent('keybindings:changed', {
      bindings: [{ key: 'ctrl+k', command: 'file.save' }],
      conflicts: [],
      error: null,
    });
    await userEvent.keyboard('{Control>}k{/Control}');

    // Es la recarga en caliente: el atajo empieza a andar sin reiniciar.
    expect(run).toHaveBeenCalledWith('file.save');
  });
});

describe('acordes', () => {
  it('no dispara nada con la primera mitad de un acorde', async () => {
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(run).not.toHaveBeenCalled();
  });

  it('dispara el comando con la segunda mitad', async () => {
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.keyboard('{Control>}t{/Control}');

    expect(run).toHaveBeenCalledWith('view.selectTheme');
  });

  it('un atajo directo le gana al prefijo de un acorde', async () => {
    // `Ctrl+K` es la primera mitad de `Ctrl+K Ctrl+T`, pero también es un atajo
    // que el usuario puede definir en su keybindings.json. Cuando existe, gana:
    // esperar una segunda tecla dejaría al atajo del usuario sin disparar nunca.
    // Por el api falso y no con `setState`: el hook pide los atajos al montar,
    // y lo que responda ese canal pisa cualquier estado puesto de antemano.
    installFakeApi({
      'keybindings:get': {
        ok: true,
        value: {
          bindings: [{ key: 'ctrl+k', command: 'palette.open' }],
          conflicts: [],
          error: null,
        },
      },
    });
    render(<KeybindingHost />);

    await waitFor(() => {
      expect(useKeybindingsStore.getState().bindings).toHaveLength(1);
    });
    await userEvent.keyboard('{Control>}k{/Control}');

    expect(openPalette).toHaveBeenCalledOnce();
  });

  it('abandona el acorde cuando la segunda tecla no completa ninguno', async () => {
    // Es lo que espera cualquiera que se equivocó de tecla: el acorde se cae,
    // no queda esperando una tercera.
    render(<KeybindingHost />);

    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.keyboard('{Control>}j{/Control}');
    await userEvent.keyboard('{Control>}t{/Control}');

    expect(run).not.toHaveBeenCalledWith('view.selectTheme');

    // Y el atajo simple siguiente vuelve a funcionar.
    await userEvent.keyboard('{Control>}s{/Control}');

    expect(run).toHaveBeenCalledWith('file.save');
  });
});
