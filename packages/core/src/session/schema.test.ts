import { describe, expect, it } from 'vitest';

import { TabStateSchema, WorkspaceStateSchema } from './schema.js';

/** Una sesión válida mínima. */
const VALID = {
  rootPath: 'C:\\proyecto',
  openTabs: [],
  activeTabIndex: -1,
  expandedFolders: [],
  lastSavedAt: 1_700_000_000_000,
};

describe('WorkspaceStateSchema', () => {
  it('acepta una sesión sin pestañas', () => {
    expect(() => WorkspaceStateSchema.parse(VALID)).not.toThrow();
  });

  it('conserva las claves que no conoce', () => {
    // Es la diferencia con el schema de settings, y es deliberada: este
    // archivo lo escribe la app, así que una clave desconocida significa "lo
    // escribió una versión más nueva", no "hay un error de tipeo".
    //
    // El ejemplo **era** `breakpoints`, que este schema anunciaba por nombre
    // sin que el tipo existiera. Ya llegó con el DAP, así que ahora se valida y
    // el caso de laxitud lo cubre otra clave — que es exactamente cómo tenía
    // que envejecer este test.
    const parsed = WorkspaceStateSchema.parse({ ...VALID, watchExpressions: ['i > 3'] });

    expect(parsed).toMatchObject({ watchExpressions: ['i > 3'] });
  });

  it('valida los breakpoints, que ya dejaron de ser una clave desconocida', () => {
    const breakpoint = { path: 'C:\\p\\a.ts', line: 12, enabled: true };

    expect(WorkspaceStateSchema.parse({ ...VALID, breakpoints: [breakpoint] })).toMatchObject({
      breakpoints: [breakpoint],
    });
  });

  it('rechaza un breakpoint sin ruta', () => {
    // La laxitud es para las claves que este schema no conoce, no para las que
    // sí: un breakpoint sin archivo no se puede restaurar ni mandarle a DAP.
    expect(() =>
      WorkspaceStateSchema.parse({ ...VALID, breakpoints: [{ line: 4 }] })
    ).toThrow();
  });

  it('acepta una sesión sin breakpoints', () => {
    // Es el archivo de todo el mundo hasta hoy: el campo es opcional para que
    // aparezca sin migración ni bump de versión.
    expect(() => WorkspaceStateSchema.parse(VALID)).not.toThrow();
  });

  it('rechaza una sesión sin raíz', () => {
    const { rootPath: _omitted, ...withoutRoot } = VALID;

    expect(() => WorkspaceStateSchema.parse(withoutRoot)).toThrow();
  });

  it('rechaza un índice activo imposible', () => {
    expect(() => WorkspaceStateSchema.parse({ ...VALID, activeTabIndex: -2 })).toThrow();
  });

  it('rechaza una pestaña con la forma equivocada', () => {
    expect(() =>
      WorkspaceStateSchema.parse({ ...VALID, openTabs: [{ uri: 'file:///a.ts' }] })
    ).toThrow();
  });
});

describe('TabStateSchema', () => {
  it('exige coordenadas base 1, como LSP', () => {
    expect(() =>
      TabStateSchema.parse({
        uri: 'file:///a.ts',
        cursorPosition: { line: 0, column: 1 },
        scrollTopLine: 1,
        isDirty: false,
        isPinned: false,
      })
    ).toThrow();
  });

  it('acepta una pestaña completa', () => {
    expect(() =>
      TabStateSchema.parse({
        uri: 'file:///a.ts',
        cursorPosition: { line: 12, column: 5 },
        scrollTopLine: 3,
        isDirty: true,
        isPinned: false,
      })
    ).not.toThrow();
  });
});
