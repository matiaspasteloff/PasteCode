import type { DirectoryEntry, FileTreeNode } from '@pastecode/core';
import type { SerializedError } from '@pastecode/ipc-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useFileTreeStore } from './file-tree-store.js';

const ROOT = '/proyecto';

/** Una entrada de directorio. */
function entry(name: string, isDirectory = false, parent = ROOT): DirectoryEntry {
  return { name, path: `${parent}/${name}`, isDirectory };
}

const FAILURE: SerializedError = { code: 'FILE_ACCESS_DENIED', userMessage: 'sin permiso' };

/**
 * El contenido de cada carpeta, por ruta.
 *
 * Las respuestas del api falso son fijas por canal, y acá hace falta que
 * `fs:readDirectory` conteste distinto según la carpeta que se le pida: sin eso
 * no se puede testear una expansión, que es leer un nivel adentro de otro.
 */
let directories: Map<string, DirectoryEntry[]>;

/** Las carpetas que se pidieron leer, en orden. */
let reads: string[];

let invoke: ReturnType<typeof installFakeApi>;

/** Los canales de RF-003 que se llamaron, con su payload. */
let operations: { channel: string; payload: unknown }[];

/** Si las operaciones de RF-003 tienen que fallar. */
let operationFails: boolean;

/** Instala un `fs:readDirectory` que contesta según `directories`. */
function installTree(): void {
  invoke = installFakeApi({});
  reads = [];
  operations = [];
  operationFails = false;

  invoke.mockImplementation((channel, payload: unknown) => {
    if (channel !== 'fs:readDirectory') {
      operations.push({ channel, payload });

      if (operationFails) return Promise.resolve({ ok: false, error: FAILURE });

      return Promise.resolve({ ok: true, value: {} });
    }

    const path =
      typeof payload === 'object' && payload !== null && 'path' in payload
        ? String(payload.path)
        : '';

    reads.push(path);

    const entries = directories.get(path);

    if (entries === undefined) return Promise.resolve({ ok: false, error: FAILURE });

    return Promise.resolve({ ok: true, value: { entries } });
  });
}

beforeEach(() => {
  directories = new Map<string, DirectoryEntry[]>([
    [ROOT, [entry('src', true), entry('README.md')]],
    [`${ROOT}/src`, [entry('a.ts', false, `${ROOT}/src`)]],
  ]);

  installTree();

  useFileTreeStore.setState({
    roots: [],
    expandedPaths: new Set<string>(),
    isLoading: false,
    error: null,
    edit: null,
    pendingDeletion: null,
  });
});

describe('loadRoot', () => {
  it('carga el primer nivel', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);

    expect(useFileTreeStore.getState().roots.map((node) => node.name)).toEqual([
      'src',
      'README.md',
    ]);
    expect(useFileTreeStore.getState().isLoading).toBe(false);
  });

  it('trae un solo nivel y no el árbol entero', async () => {
    // Es lo que hace que RF-001 se cumpla sin trucos con 5.000 archivos.
    await useFileTreeStore.getState().loadRoot(ROOT);

    expect(reads).toEqual([ROOT]);
  });

  it('descarta lo desplegado de un workspace anterior', async () => {
    useFileTreeStore.setState({ expandedPaths: new Set([`${ROOT}/viejo`]) });

    await useFileTreeStore.getState().loadRoot(ROOT);

    expect(useFileTreeStore.getState().expandedPaths.size).toBe(0);
  });

  it('guarda el error y apaga el cargando cuando no se puede leer', async () => {
    await useFileTreeStore.getState().loadRoot('/no-existe');

    expect(useFileTreeStore.getState().error).toEqual(FAILURE);
    expect(useFileTreeStore.getState().isLoading).toBe(false);
  });
});

describe('toggleFolder', () => {
  beforeEach(async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    reads = [];
  });

  it('despliega la carpeta y cuelga sus hijos', async () => {
    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);

    const { roots, expandedPaths } = useFileTreeStore.getState();

    expect(expandedPaths.has(`${ROOT}/src`)).toBe(true);
    expect(roots[0]?.children?.map((node) => node.name)).toEqual(['a.ts']);
  });

  it('repliega sin volver a leer del disco', async () => {
    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);
    reads = [];

    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);

    expect(useFileTreeStore.getState().expandedPaths.has(`${ROOT}/src`)).toBe(false);
    expect(reads).toEqual([]);
  });

  it('no relee una carpeta cuyos hijos ya trajo', async () => {
    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);
    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);
    reads = [];

    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);

    expect(reads).toEqual([]);
  });

  it('vuelve a replegar la carpeta que no se pudo leer', async () => {
    // Dejarla abierta y vacía haría parecer que la carpeta no tiene nada,
    // cuando lo que pasó es que no se pudo leer.
    directories.delete(`${ROOT}/src`);

    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);

    expect(useFileTreeStore.getState().expandedPaths.has(`${ROOT}/src`)).toBe(false);
    expect(useFileTreeStore.getState().error).toEqual(FAILURE);
  });
});

describe('refresh', () => {
  it('no hace nada sin nada cargado', async () => {
    await useFileTreeStore.getState().refresh();

    expect(reads).toEqual([]);
  });

  it('trae lo que apareció en disco sin replegar nada', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);

    directories.set(`${ROOT}/src`, [
      entry('a.ts', false, `${ROOT}/src`),
      entry('nuevo.ts', false, `${ROOT}/src`),
    ]);

    await useFileTreeStore.getState().refresh();

    const { roots, expandedPaths } = useFileTreeStore.getState();

    expect(roots[0]?.children?.map((node) => node.name)).toEqual(['a.ts', 'nuevo.ts']);
    // Lo que separa `refresh` de `loadRoot`: replegar el árbol cada vez que una
    // herramienta externa toca un archivo es lo que hace que la gente apague el
    // auto-refresh.
    expect(expandedPaths.has(`${ROOT}/src`)).toBe(true);
  });

  it('no borra el árbol cuando el refresco falla', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    directories.delete(ROOT);

    await useFileTreeStore.getState().refresh();

    expect(useFileTreeStore.getState().roots).toHaveLength(2);
  });
});

describe('clear', () => {
  it('vacía el árbol y lo desplegado', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    await useFileTreeStore.getState().toggleFolder(`${ROOT}/src`);

    useFileTreeStore.getState().clear();

    const state = useFileTreeStore.getState();

    expect(state.roots).toEqual([]);
    expect(state.expandedPaths.size).toBe(0);
    expect(state.error).toBeNull();
  });
});

/**
 * El nodo de primer nivel con ese nombre.
 *
 * Lanza si no está en vez de devolver `undefined`: que el árbol no lo tenga es
 * un bug del test, y el mensaje dice cuál mucho mejor que un `!` en la línea de
 * abajo.
 */
function rootNode(name: string): FileTreeNode {
  const node = useFileTreeStore.getState().roots.find((item) => item.name === name);

  if (node === undefined) throw new Error(`El árbol no tiene ningún "${name}"`);

  return node;
}

describe('crear (RF-003)', () => {
  it('abre el campo sobre la carpeta elegida', () => {
    useFileTreeStore.getState().startCreate(`${ROOT}/src`, false);

    expect(useFileTreeStore.getState().edit).toEqual({
      kind: 'createFile',
      parentPath: `${ROOT}/src`,
    });
  });

  it('crea el archivo con el nombre escrito, adentro de esa carpeta', async () => {
    useFileTreeStore.getState().startCreate(`${ROOT}/src`, false);

    await useFileTreeStore.getState().commitEdit('nuevo.ts');

    expect(operations).toEqual([
      { channel: 'fs:createFile', payload: { path: `${ROOT}/src/nuevo.ts` } },
    ]);
  });

  it('usa el canal de directorios al crear una carpeta', async () => {
    useFileTreeStore.getState().startCreate(ROOT, true);

    await useFileTreeStore.getState().commitEdit('componentes');

    expect(operations[0]?.channel).toBe('fs:createDirectory');
  });

  it('cierra el campo al confirmar', async () => {
    useFileTreeStore.getState().startCreate(ROOT, false);

    await useFileTreeStore.getState().commitEdit('a.ts');

    expect(useFileTreeStore.getState().edit).toBeNull();
  });

  it('no llama al disco con un nombre vacío, sólo cierra', async () => {
    // Apretar Enter sin escribir nada no es un error: es cancelar.
    useFileTreeStore.getState().startCreate(ROOT, false);

    await useFileTreeStore.getState().commitEdit('   ');

    expect(operations).toEqual([]);
    expect(useFileTreeStore.getState().edit).toBeNull();
  });

  it('cancelar no toca el disco', () => {
    useFileTreeStore.getState().startCreate(ROOT, false);

    useFileTreeStore.getState().cancelEdit();

    expect(operations).toEqual([]);
    expect(useFileTreeStore.getState().edit).toBeNull();
  });

  it('muestra el error cuando el nombre ya está ocupado', async () => {
    operationFails = true;
    useFileTreeStore.getState().startCreate(ROOT, false);

    await useFileTreeStore.getState().commitEdit('ocupado.ts');

    expect(useFileTreeStore.getState().error).toEqual(FAILURE);
  });

  it('refresca el árbol después de crear', async () => {
    // Sin esto habría que esperar al debounce del watcher para ver la fila.
    await useFileTreeStore.getState().loadRoot(ROOT);
    reads.length = 0;
    useFileTreeStore.getState().startCreate(ROOT, false);

    await useFileTreeStore.getState().commitEdit('nuevo.ts');

    expect(reads).toContain(ROOT);
  });
});

describe('renombrar (RF-003)', () => {
  it('abre el campo con el nombre actual', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    useFileTreeStore.getState().startRename(rootNode('README.md'));

    expect(useFileTreeStore.getState().edit).toEqual({
      kind: 'rename',
      path: `${ROOT}/README.md`,
      currentName: 'README.md',
    });
  });

  it('renombra dentro de la misma carpeta', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    useFileTreeStore.getState().startRename(rootNode('README.md'));

    await useFileTreeStore.getState().commitEdit('LEEME.md');

    expect(operations).toEqual([
      {
        channel: 'fs:rename',
        payload: { from: `${ROOT}/README.md`, to: `${ROOT}/LEEME.md` },
      },
    ]);
  });

  it('no llama al disco si el nombre no cambió', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    useFileTreeStore.getState().startRename(rootNode('README.md'));

    await useFileTreeStore.getState().commitEdit('README.md');

    expect(operations).toEqual([]);
  });
});

describe('eliminar (RF-003)', () => {
  it('pide confirmación antes de tocar el disco', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);

    useFileTreeStore.getState().requestDeletion(rootNode('README.md'));

    expect(useFileTreeStore.getState().pendingDeletion?.name).toBe('README.md');
    expect(operations).toEqual([]);
  });

  it('elimina lo confirmado', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    useFileTreeStore.getState().requestDeletion(rootNode('README.md'));

    await useFileTreeStore.getState().confirmDeletion();

    expect(operations).toEqual([
      { channel: 'fs:delete', payload: { path: `${ROOT}/README.md` } },
    ]);
  });

  it('cancelar cierra el diálogo sin eliminar nada', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    useFileTreeStore.getState().requestDeletion(rootNode('README.md'));

    useFileTreeStore.getState().cancelDeletion();

    expect(useFileTreeStore.getState().pendingDeletion).toBeNull();
    expect(operations).toEqual([]);
  });

  it('muestra el error cuando la papelera falla', async () => {
    await useFileTreeStore.getState().loadRoot(ROOT);
    useFileTreeStore.getState().requestDeletion(rootNode('README.md'));
    operationFails = true;

    await useFileTreeStore.getState().confirmDeletion();

    expect(useFileTreeStore.getState().error).toEqual(FAILURE);
  });

  it('confirmar sin nada pendiente no hace nada', async () => {
    await useFileTreeStore.getState().confirmDeletion();

    expect(operations).toEqual([]);
  });
});
