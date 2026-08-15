import { activeTab } from '@pastecode/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetEditorStore, tabsWith } from '../test-support/editor-state.js';
import { installFakeApi } from '../test-support/fake-api.js';

import { useEditorStore } from './editor-store.js';

const A = 'C:\\p\\a.ts';
const B = 'C:\\p\\b.ts';

/** El estado actual, para que las aserciones no repitan `getState()`. */
function state() {
  return useEditorStore.getState();
}

beforeEach(() => {
  resetEditorStore();
});

describe('abrir archivos', () => {
  it('abre una pestaña y deja el contenido listo para el editor', async () => {
    installFakeApi({ 'fs:readFile': { ok: true, value: { content: 'hola', mtimeMs: 10 } } });

    await state().open(A);

    expect(state().tabs.tabs.map((tab) => tab.path)).toEqual([A]);
    expect(state().pendingFile).toEqual({ path: A, content: 'hola' });
    expect(state().mtimes[A]).toBe(10);
  });

  it('no relee un archivo que ya está abierto', async () => {
    // El modelo tiene las ediciones sin guardar y el historial de undo:
    // releerlo al volver a la pestaña las tiraría.
    const invoke = installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'hola', mtimeMs: 10 } },
    });
    await state().open(A);
    await state().open(B);
    invoke.mockClear();

    await state().open(A);

    expect(invoke).not.toHaveBeenCalled();
    expect(activeTab(state().tabs)?.path).toBe(A);
  });

  it('deja el error en el estado sin cerrar lo que ya estaba abierto', async () => {
    const invoke = installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'hola', mtimeMs: 10 } },
    });
    await state().open(A);

    invoke.mockResolvedValueOnce({
      ok: false,
      error: { code: 'BINARY_FILE_UNSUPPORTED', userMessage: 'Es binario.' },
    });
    await state().open('C:\\p\\logo.png');

    expect(state().error?.code).toBe('BINARY_FILE_UNSUPPORTED');
    expect(state().tabs.tabs.map((tab) => tab.path)).toEqual([A]);
  });
});

describe('cerrar pestañas', () => {
  it('olvida el mtime del archivo cerrado', async () => {
    installFakeApi({ 'fs:readFile': { ok: true, value: { content: 'hola', mtimeMs: 10 } } });
    await state().open(A);

    state().closeTab(0);

    expect(state().mtimes[A]).toBeUndefined();
    expect(state().tabs.activeTabIndex).toBe(-1);
  });

  it('ignora un índice que no existe', () => {
    useEditorStore.setState({ tabs: tabsWith([A]) });

    state().closeTab(7);

    expect(state().tabs.tabs).toHaveLength(1);
  });
});

describe('guardar', () => {
  /** Deja una pestaña activa, sucia y con contenido para escribir. */
  function withDirtyTab(content: string): void {
    useEditorStore.setState({
      tabs: tabsWith([A, B], 0),
      mtimes: { [A]: 100 },
      readContent: () => content,
    });
    state().markDirty();
  }

  it('manda el expectedMtimeMs de la última lectura de la pestaña activa', async () => {
    const invoke = installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 200 } } });
    withDirtyTab('nuevo');

    await state().save();

    expect(invoke).toHaveBeenCalledWith('fs:writeFile', {
      path: A,
      content: 'nuevo',
      expectedMtimeMs: 100,
    });
  });

  it('limpia el estado sucio y adopta el mtime nuevo', async () => {
    installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 200 } } });
    withDirtyTab('nuevo');

    await state().save();

    expect(state().tabs.tabs[0]?.isDirty).toBe(false);
    expect(state().mtimes[A]).toBe(200);
  });

  it('omite el expectedMtimeMs al forzar, en vez de mandarlo en undefined', async () => {
    // Con exactOptionalPropertyTypes no son lo mismo, y el schema del canal es
    // estricto: mandar la propiedad en undefined sería un error de validación.
    const invoke = installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 300 } } });
    withDirtyTab('nuevo');

    await state().save({ force: true });

    expect(invoke).toHaveBeenCalledWith('fs:writeFile', { path: A, content: 'nuevo' });
  });

  it('manda un conflicto a su propio campo y conserva el estado sucio', async () => {
    installFakeApi({
      'fs:writeFile': { ok: false, error: { code: 'STALE_FILE', userMessage: 'Cambió.' } },
    });
    withDirtyTab('nuevo');

    await state().save();

    expect(state().conflict?.code).toBe('STALE_FILE');
    expect(state().error).toBeNull();
    // Perder la marca haría creer que se guardó y el próximo Ctrl+S no
    // reintentaría.
    expect(state().tabs.tabs[0]?.isDirty).toBe(true);
  });

  it('trata cualquier otro fallo como error normal', async () => {
    installFakeApi({
      'fs:writeFile': {
        ok: false,
        error: { code: 'FILE_ACCESS_DENIED', userMessage: 'Sin permisos.' },
      },
    });
    withDirtyTab('nuevo');

    await state().save();

    expect(state().conflict).toBeNull();
    expect(state().error?.code).toBe('FILE_ACCESS_DENIED');
  });

  it('no hace nada si no hay pestaña activa', async () => {
    const invoke = installFakeApi({});

    await state().save();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('sólo marca sucia la pestaña activa', () => {
    useEditorStore.setState({ tabs: tabsWith([A, B], 1) });

    state().markDirty();

    expect(state().tabs.tabs.map((tab) => tab.isDirty)).toEqual([false, true]);
  });
});

describe('descartar cambios', () => {
  it('relee el archivo y limpia el conflicto', async () => {
    installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'del disco', mtimeMs: 900 } },
    });
    useEditorStore.setState({
      tabs: tabsWith([A]),
      conflict: { code: 'STALE_FILE', userMessage: 'Cambió.' },
    });

    await state().discardAndReload();

    expect(state().pendingFile).toEqual({ path: A, content: 'del disco' });
    expect(state().conflict).toBeNull();
    expect(state().tabs.tabs[0]?.isDirty).toBe(false);
  });

  it('no hace nada sin pestaña activa', async () => {
    const invoke = installFakeApi({});

    await state().discardAndReload();

    expect(invoke).not.toHaveBeenCalled();
  });
});
