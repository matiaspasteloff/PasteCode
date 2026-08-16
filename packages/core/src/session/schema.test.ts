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
    // escribió una versión más nueva", no "hay un error de tipeo". El caso
    // concreto es `breakpoints`, que llega con el DAP en la Etapa 5.
    const parsed = WorkspaceStateSchema.parse({ ...VALID, breakpoints: [{ line: 4 }] });

    expect(parsed).toMatchObject({ breakpoints: [{ line: 4 }] });
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
