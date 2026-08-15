import { describe, expect, it } from 'vitest';

import { getWorkspaceRoot, requireWorkspaceRoot, setWorkspaceRoot } from './workspace.js';

describe('el workspace abierto', () => {
  it('arranca sin ninguno', () => {
    expect(getWorkspaceRoot()).toBeUndefined();
  });

  it('falla con WORKSPACE_NOT_OPEN si se pide la raíz sin haber abierto nada', () => {
    expect(() => requireWorkspaceRoot()).toThrow(
      expect.objectContaining({ code: 'WORKSPACE_NOT_OPEN' })
    );
  });

  it('devuelve la raíz una vez abierta', () => {
    setWorkspaceRoot('C:\\proyecto');

    expect(getWorkspaceRoot()).toBe('C:\\proyecto');
    expect(requireWorkspaceRoot()).toBe('C:\\proyecto');
  });

  it('reemplaza la raíz anterior al abrir otra carpeta', () => {
    setWorkspaceRoot('C:\\proyecto');
    setWorkspaceRoot('C:\\otro');

    expect(requireWorkspaceRoot()).toBe('C:\\otro');
  });
});
