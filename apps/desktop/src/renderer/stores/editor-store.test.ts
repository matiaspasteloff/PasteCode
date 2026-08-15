import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useEditorStore } from './editor-store.js';

const PATH = 'C:\\p\\a.ts';

beforeEach(() => {
  // El store es de módulo y no tiene provider. Ver ADR-0004.
  useEditorStore.setState({
    file: null,
    isLoading: false,
    isSaving: false,
    isDirty: false,
    error: null,
    conflict: null,
    readContent: null,
  });
});

describe('useEditorStore', () => {
  it('guarda el contenido y el mtime de la lectura', async () => {
    installFakeApi({
      'fs:readFile': {
        ok: true,
        value: { content: 'const x = 1;', mtimeMs: 1_700_000_000_000 },
      },
    });

    await useEditorStore.getState().open(PATH);

    expect(useEditorStore.getState().file).toEqual({
      path: PATH,
      content: 'const x = 1;',
      mtimeMs: 1_700_000_000_000,
    });
  });

  it('conserva el mtime porque es lo que detecta el conflicto al guardar', async () => {
    // Sin el mtime de la lectura no hay `expectedMtimeMs` que mandar, y sin
    // eso `fs:writeFile` pisa en silencio lo que otro proceso haya escrito.
    installFakeApi({
      'fs:readFile': { ok: true, value: { content: '', mtimeMs: 42 } },
    });

    await useEditorStore.getState().open(PATH);

    expect(useEditorStore.getState().file?.mtimeMs).toBe(42);
  });

  it('deja el error del IPC en el estado, sin lanzarlo', async () => {
    installFakeApi({
      'fs:readFile': {
        ok: false,
        error: { code: 'BINARY_FILE_UNSUPPORTED', userMessage: 'Es binario.' },
      },
    });

    await useEditorStore.getState().open('C:\\p\\logo.png');

    expect(useEditorStore.getState().error).toEqual({
      code: 'BINARY_FILE_UNSUPPORTED',
      userMessage: 'Es binario.',
    });
  });

  it('descarta el archivo anterior cuando el nuevo falla', async () => {
    // Dejarlo en pantalla mientras el mensaje habla de otro archivo confunde
    // más de lo que ayuda.
    const invoke = installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'viejo', mtimeMs: 1 } },
    });
    await useEditorStore.getState().open(PATH);

    invoke.mockResolvedValueOnce({
      ok: false,
      error: { code: 'FILE_ACCESS_DENIED', userMessage: 'No se pudo.' },
    });
    await useEditorStore.getState().open('C:\\p\\otro.ts');

    expect(useEditorStore.getState().file).toBeNull();
  });

  it('limpia el error al abrir un archivo nuevo con éxito', async () => {
    const invoke = installFakeApi({
      'fs:readFile': { ok: false, error: { code: 'X', userMessage: 'Falló.' } },
    });
    await useEditorStore.getState().open(PATH);

    invoke.mockResolvedValueOnce({ ok: true, value: { content: 'ok', mtimeMs: 2 } });
    await useEditorStore.getState().open(PATH);

    expect(useEditorStore.getState().error).toBeNull();
  });

  it('cierra el archivo abierto', () => {
    useEditorStore.setState({ file: { path: PATH, content: 'x', mtimeMs: 1 } });

    useEditorStore.getState().close();

    expect(useEditorStore.getState().file).toBeNull();
  });
});

describe('guardado', () => {
  /** Deja el store como si hubiera un archivo abierto y editado. */
  function withOpenFile(content: string) {
    useEditorStore.setState({
      file: { path: PATH, content: 'viejo', mtimeMs: 100 },
      isDirty: true,
      readContent: () => content,
    });
  }

  it('manda el expectedMtimeMs de la última lectura', async () => {
    const invoke = installFakeApi({
      'fs:writeFile': { ok: true, value: { mtimeMs: 200 } },
    });
    withOpenFile('nuevo');

    await useEditorStore.getState().save();

    expect(invoke).toHaveBeenCalledWith('fs:writeFile', {
      path: PATH,
      content: 'nuevo',
      expectedMtimeMs: 100,
    });
  });

  it('deja de estar sucio y adopta el mtime nuevo al guardar bien', async () => {
    installFakeApi({ 'fs:writeFile': { ok: true, value: { mtimeMs: 200 } } });
    withOpenFile('nuevo');

    await useEditorStore.getState().save();

    expect(useEditorStore.getState().isDirty).toBe(false);
    expect(useEditorStore.getState().file).toEqual({
      path: PATH,
      content: 'nuevo',
      mtimeMs: 200,
    });
  });

  it('omite el expectedMtimeMs al forzar, en vez de mandarlo en undefined', async () => {
    // Con exactOptionalPropertyTypes no son lo mismo, y el schema del canal es
    // estricto: mandar la propiedad en undefined sería un error de validación.
    const invoke = installFakeApi({
      'fs:writeFile': { ok: true, value: { mtimeMs: 300 } },
    });
    withOpenFile('nuevo');

    await useEditorStore.getState().save({ force: true });

    expect(invoke).toHaveBeenCalledWith('fs:writeFile', { path: PATH, content: 'nuevo' });
  });

  it('manda un conflicto a su propio campo y no al de error', async () => {
    installFakeApi({
      'fs:writeFile': {
        ok: false,
        error: { code: 'STALE_FILE', userMessage: 'Cambió en el disco.' },
      },
    });
    withOpenFile('nuevo');

    await useEditorStore.getState().save();

    expect(useEditorStore.getState().conflict?.code).toBe('STALE_FILE');
    expect(useEditorStore.getState().error).toBeNull();
  });

  it('conserva el estado sucio cuando el guardado falla', async () => {
    // Perder la marca haría creer que se guardó, y el próximo Ctrl+S no
    // reintentaría.
    installFakeApi({
      'fs:writeFile': { ok: false, error: { code: 'STALE_FILE', userMessage: 'x' } },
    });
    withOpenFile('nuevo');

    await useEditorStore.getState().save();

    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('trata cualquier otro fallo como error normal', async () => {
    installFakeApi({
      'fs:writeFile': {
        ok: false,
        error: { code: 'FILE_ACCESS_DENIED', userMessage: 'Sin permisos.' },
      },
    });
    withOpenFile('nuevo');

    await useEditorStore.getState().save();

    expect(useEditorStore.getState().conflict).toBeNull();
    expect(useEditorStore.getState().error?.code).toBe('FILE_ACCESS_DENIED');
  });

  it('no hace nada si no hay archivo abierto', async () => {
    const invoke = installFakeApi({});

    await useEditorStore.getState().save();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('descarta los cambios releyendo el archivo del disco', async () => {
    installFakeApi({
      'fs:readFile': { ok: true, value: { content: 'del disco', mtimeMs: 900 } },
    });
    withOpenFile('lo que escribí');

    await useEditorStore.getState().discardAndReload();

    expect(useEditorStore.getState().file?.content).toBe('del disco');
    expect(useEditorStore.getState().isDirty).toBe(false);
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});
