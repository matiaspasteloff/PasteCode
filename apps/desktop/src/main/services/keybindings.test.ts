import { realpathSync } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  currentKeybindings,
  disposeKeybindings,
  initializeKeybindings,
  type KeybindingsState,
} from './keybindings.js';

/** Techo de espera del watcher. Holgado: el CI de Windows es lento. */
const TIMEOUT_MS = 10_000;

let home: string;
let file: string;
let changes: KeybindingsState[];

async function waitFor(condition: () => boolean, describeFailure: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Se agotó la espera: ${describeFailure}`);

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(async () => {
  // `realpathSync.native` y no `realpath`: el `TEMP` del CI de Windows viene en
  // formato 8.3 y un watcher de libuv sobre una ruta corta aborta el proceso.
  // La variante de `node:fs/promises` resuelve symlinks pero deja `RUNNER~1`
  // tal cual, que es justo la mitad que acá importa.
  home = realpathSync.native(await mkdtemp(join(tmpdir(), 'pastecode-keys-')));
  file = join(home, 'keybindings.json');
  changes = [];
});

afterEach(async () => {
  disposeKeybindings();
  await rm(home, { recursive: true, force: true });
});

/** Arranca el servicio contra el directorio temporal del test. */
async function start(): Promise<KeybindingsState> {
  return initializeKeybindings({
    userPath: file,
    onChange: (state) => changes.push(state),
  });
}

/** Escribe el archivo del usuario. */
async function write(contents: unknown): Promise<void> {
  await writeFile(
    file,
    typeof contents === 'string' ? contents : JSON.stringify(contents),
    'utf8'
  );
}

describe('el servicio de keybindings', () => {
  it('arranca sin atajos cuando no hay archivo', async () => {
    // Es el caso de una instalación nueva, y no es un error: significa
    // "ningún atajo propio".
    const state = await start();

    expect(state.bindings).toEqual([]);
    expect(state.error).toBeUndefined();
  });

  it('carga los atajos del usuario', async () => {
    await write([{ key: 'ctrl+k', command: 'file.save' }]);

    const state = await start();

    expect(state.bindings).toEqual([{ key: 'ctrl+k', command: 'file.save' }]);
  });

  it('normaliza las teclas al cargarlas', async () => {
    // Nadie escribe `ctrl+shift+p` a mano; escribe `Ctrl+Shift+P`. Sin
    // normalizar, ese atajo no dispararía nunca y no habría error que mirar.
    await write([{ key: 'Shift+Ctrl+P', command: 'palette.open' }]);

    const state = await start();

    expect(state.bindings[0]?.key).toBe('ctrl+shift+p');
  });

  it('crea el directorio de datos si no existe', async () => {
    // Sin esto, en una instalación nueva no hay qué observar y la recarga en
    // caliente no anda hasta que alguien cree la carpeta a mano.
    const directory = join(home, 'no-existe');

    await initializeKeybindings({
      userPath: join(directory, 'keybindings.json'),
      onChange: () => undefined,
    });

    await expect(stat(directory)).resolves.toBeDefined();
  });
});

describe('los conflictos (RF-702)', () => {
  it('no reporta nada cuando no hay archivo', async () => {
    const state = await start();

    expect(state.conflicts).toEqual([]);
  });

  it('no mira los de fábrica, así que un override no es conflicto', async () => {
    // `ctrl+s` es un atajo de fábrica. Pisarlo tiene la misma tecla y la misma
    // condición, así que entraría como conflicto si se comparara contra ellos —
    // y es exactamente para lo que existe el archivo.
    await write([{ key: 'ctrl+s', command: 'file.saveAll' }]);

    const state = await start();

    expect(state.conflicts).toEqual([]);
  });

  it('reporta dos atajos del usuario con la misma tecla y la misma condición', async () => {
    await write([
      { key: 'ctrl+k', command: 'file.save' },
      { key: 'ctrl+k', command: 'terminal.toggle' },
    ]);

    const state = await start();

    expect(state.conflicts).toEqual([
      { key: 'ctrl+k', commands: ['file.save', 'terminal.toggle'] },
    ]);
  });

  it('no reporta dos atajos con la misma tecla y condiciones distintas', async () => {
    // Ahí decide el desempate por especificidad, y avisar sería ruido.
    await write([
      { key: 'ctrl+k', command: 'file.save', when: 'editorFocus' },
      { key: 'ctrl+k', command: 'terminal.toggle', when: 'terminalFocus' },
    ]);

    const state = await start();

    expect(state.conflicts).toEqual([]);
  });

  it('detecta el conflicto aunque las teclas estén escritas distinto', async () => {
    // `Ctrl+K` y `ctrl+k` son la misma tecla para quien la aprieta. Sin
    // normalizar antes de agrupar, este conflicto pasaría desapercibido.
    await write([
      { key: 'Ctrl+K', command: 'file.save' },
      { key: 'ctrl+k', command: 'terminal.toggle' },
    ]);

    const state = await start();

    expect(state.conflicts).toHaveLength(1);
  });
});

describe('el archivo inválido', () => {
  it('no deja la app sin atajos cuando el JSON está roto', async () => {
    // RNF-25: se sigue andando, con los de fábrica, y además se avisa.
    await write('[{ "key": "ctrl+k", }');

    const state = await start();

    expect(state.error?.code).toBe('INVALID_KEYBINDINGS_FILE');
    expect(state.bindings).toEqual([]);
  });

  it('rechaza una clave que no está en el schema', async () => {
    await write([{ key: 'ctrl+k', comando: 'file.save' }]);

    const state = await start();

    expect(state.error?.code).toBe('INVALID_KEYBINDINGS_FILE');
  });

  it('nombra el archivo en el mensaje, para que se pueda ir a corregirlo', async () => {
    await write('no soy json');

    const state = await start();

    expect(state.error?.userMessage).toContain(file);
  });

  it('conserva los últimos atajos buenos cuando el archivo se rompe', async () => {
    await write([{ key: 'ctrl+k', command: 'file.save' }]);
    await start();

    await write('{ roto');
    await waitFor(() => changes.length > 0, 'el watcher nunca vio el archivo roto');

    expect(currentKeybindings().bindings).toEqual([{ key: 'ctrl+k', command: 'file.save' }]);
    expect(currentKeybindings().error?.code).toBe('INVALID_KEYBINDINGS_FILE');
  });
});

describe('la recarga en caliente (RF-702)', () => {
  it('avisa cuando el archivo cambia desde afuera', async () => {
    await start();

    await write([{ key: 'ctrl+j', command: 'terminal.toggle' }]);

    await waitFor(() => changes.length > 0, 'nunca llegó la notificación');
    expect(changes.at(-1)?.bindings).toEqual([{ key: 'ctrl+j', command: 'terminal.toggle' }]);
  });

  it('avisa de un conflicto que apareció al editar el archivo', async () => {
    await start();

    await write([
      { key: 'ctrl+j', command: 'a' },
      { key: 'ctrl+j', command: 'b' },
    ]);

    await waitFor(() => changes.length > 0, 'nunca llegó la notificación');
    expect(changes.at(-1)?.conflicts).toHaveLength(1);
  });

  it('se recupera solo cuando el archivo se arregla', async () => {
    await start();
    await write('{ roto');
    await waitFor(() => currentKeybindings().error !== undefined, 'nunca vio el archivo roto');

    await write([{ key: 'ctrl+j', command: 'terminal.toggle' }]);

    await waitFor(() => currentKeybindings().error === undefined, 'nunca se recuperó');
    expect(currentKeybindings().bindings).toHaveLength(1);
  });

  it('colapsa la ráfaga de un guardado en una sola notificación', async () => {
    await start();

    await write([{ key: 'ctrl+1', command: 'a' }]);
    await write([{ key: 'ctrl+2', command: 'b' }]);
    await write([{ key: 'ctrl+3', command: 'c' }]);

    await waitFor(() => changes.length > 0, 'nunca llegó la notificación');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(changes).toHaveLength(1);
    expect(changes.at(-1)?.bindings[0]?.key).toBe('ctrl+3');
  });

  it('deja de avisar después de que se lo desecha', async () => {
    await start();
    disposeKeybindings();

    await write([{ key: 'ctrl+j', command: 'terminal.toggle' }]);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(changes).toEqual([]);
  });
});
