import { beforeEach, describe, expect, it } from 'vitest';

import { installFakeApi } from '../test-support/fake-api.js';

import { useEditorStore } from './editor-store.js';

const PATH = 'C:\\p\\a.ts';

beforeEach(() => {
  // El store es de módulo y no tiene provider. Ver ADR-0004.
  useEditorStore.setState({ file: null, isLoading: false, error: null });
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
