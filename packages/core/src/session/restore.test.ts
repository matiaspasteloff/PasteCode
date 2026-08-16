import { describe, expect, it } from 'vitest';

import { fromFileUri, planRestore, toFileUri } from './restore.js';
import type { WorkspaceState } from './schema.js';

/** Una pestaña guardada, con lo mínimo distinto en cada caso. */
function tab(uri: string, line = 1) {
  return {
    uri,
    cursorPosition: { line, column: 1 },
    scrollTopLine: 1,
    isDirty: false,
    isPinned: false,
  };
}

/** Una sesión guardada. */
function session(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    rootPath: 'C:\\proyecto',
    openTabs: [],
    activeTabIndex: -1,
    expandedFolders: [],
    lastSavedAt: 0,
    ...overrides,
  };
}

describe('toFileUri y fromFileUri', () => {
  it('traduce una ruta de Windows y vuelve', () => {
    const uri = toFileUri('C:\\proyecto\\src\\a.ts');

    expect(uri).toBe('file:///C:/proyecto/src/a.ts');
    expect(fromFileUri(uri)).toBe('C:/proyecto/src/a.ts');
  });

  it('traduce una ruta POSIX y vuelve', () => {
    const uri = toFileUri('/home/matias/a.ts');

    expect(uri).toBe('file:///home/matias/a.ts');
    expect(fromFileUri(uri)).toBe('/home/matias/a.ts');
  });

  it('rechaza un URI que no es de un archivo', () => {
    // Un archivo de sesión adulterado no puede hacer que se abra cualquier cosa.
    expect(fromFileUri('http://example.com/a.ts')).toBeUndefined();
  });
});

describe('planRestore', () => {
  it('devuelve las pestañas en orden', () => {
    const plan = planRestore(
      session({
        openTabs: [tab(toFileUri('/a.ts')), tab(toFileUri('/b.ts'))],
        activeTabIndex: 0,
      }),
      () => true
    );

    expect(plan.openTabs.map((tab) => fromFileUri(tab.uri))).toEqual(['/a.ts', '/b.ts']);
  });

  it('descarta en silencio los archivos que ya no existen', () => {
    // Entre una sesión y la otra pasó un `git checkout`. Avisar de cada
    // archivo borrado sería un diálogo que nadie lee.
    const plan = planRestore(
      session({ openTabs: [tab(toFileUri('/a.ts')), tab(toFileUri('/borrado.ts'))] }),
      (path) => path !== '/borrado.ts'
    );

    expect(plan.openTabs.map((tab) => fromFileUri(tab.uri))).toEqual(['/a.ts']);
  });

  it('recalcula el índice activo cuando se descartó una pestaña anterior', () => {
    // Es el bug que aparece si se conserva el número: apuntaría a otra cosa.
    const plan = planRestore(
      session({
        openTabs: [tab(toFileUri('/borrado.ts')), tab(toFileUri('/b.ts'))],
        activeTabIndex: 1,
      }),
      (path) => path !== '/borrado.ts'
    );

    expect(plan.openTabs.map((tab) => fromFileUri(tab.uri))).toEqual(['/b.ts']);
    expect(plan.activeTabIndex).toBe(0);
  });

  it('cae en la primera sobreviviente si la activa desapareció', () => {
    const plan = planRestore(
      session({
        openTabs: [tab(toFileUri('/a.ts')), tab(toFileUri('/borrado.ts'))],
        activeTabIndex: 1,
      }),
      (path) => path !== '/borrado.ts'
    );

    expect(plan.activeTabIndex).toBe(0);
  });

  it('deja el índice en -1 si no sobrevivió ninguna', () => {
    const plan = planRestore(
      session({ openTabs: [tab(toFileUri('/borrado.ts'))], activeTabIndex: 0 }),
      () => false
    );

    expect(plan.openTabs.map((tab) => fromFileUri(tab.uri))).toEqual([]);
    expect(plan.activeTabIndex).toBe(-1);
  });

  it('descarta una pestaña con un URI que no es de archivo', () => {
    const plan = planRestore(
      session({ openTabs: [tab('http://example.com/a.ts'), tab(toFileUri('/b.ts'))] }),
      () => true
    );

    expect(plan.openTabs.map((tab) => fromFileUri(tab.uri))).toEqual(['/b.ts']);
  });

  it('conserva el estado de cada pestaña, para restaurar cursor y scroll', () => {
    const plan = planRestore(session({ openTabs: [tab(toFileUri('/a.ts'), 42)] }), () => true);

    expect(plan.openTabs[0]?.cursorPosition.line).toBe(42);
  });

  it('pasa las carpetas expandidas tal cual', () => {
    const plan = planRestore(session({ expandedFolders: ['src', 'src/main'] }), () => true);

    expect(plan.expandedFolders).toEqual(['src', 'src/main']);
  });
});
