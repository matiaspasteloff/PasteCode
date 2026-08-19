import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { toFileUri } from '@pastecode/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SessionSnapshot } from './session.js';
import {
  disposeSession,
  flushSessionSave,
  loadSession,
  planSessionRestore,
  sessionFileFor,
  useSessionDirectory,
} from './session.js';

let sessions: string;
let workspace: string;

/** Una pestaña guardada de un archivo del workspace del test. */
function tab(name: string, line = 1) {
  return {
    uri: toFileUri(join(workspace, name)),
    cursorPosition: { line, column: 1 },
    scrollTopLine: 1,
    isDirty: false,
    isPinned: false,
  };
}

/** Lo que el renderer reporta. */
function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    rootPath: workspace,
    openTabs: [],
    activeTabIndex: -1,
    expandedFolders: [],
    ...overrides,
  };
}

beforeEach(async () => {
  sessions = await mkdtemp(join(tmpdir(), 'pastecode-sessions-'));
  workspace = await mkdtemp(join(tmpdir(), 'pastecode-session-ws-'));
  useSessionDirectory(sessions);
});

afterEach(async () => {
  disposeSession();
  await rm(sessions, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

describe('sessionFileFor', () => {
  it('nombra el archivo con el hash de la raíz y no con la ruta', () => {
    const file = sessionFileFor('C:\\proyectos\\PasteCode');

    // La ruta lleva el nombre de usuario y la estructura de carpetas de
    // alguien; el hash además evita el límite de 260 caracteres de Windows.
    expect(file).not.toContain('PasteCode');
    expect(file).toMatch(/[0-9a-f]{64}\.json$/);
  });

  it('da rutas distintas para workspaces distintos', () => {
    expect(sessionFileFor('C:\\a')).not.toBe(sessionFileFor('C:\\b'));
  });
});

describe('loadSession', () => {
  it('devuelve null cuando el workspace nunca se abrió', async () => {
    await expect(loadSession(workspace)).resolves.toBeNull();
  });

  it('devuelve null ante un archivo corrupto en vez de fallar', async () => {
    await flushSessionSave(snapshot());
    await writeFile(sessionFileFor(workspace), '{ roto', 'utf8');

    // Lo único que se pierde son las pestañas abiertas. Un diálogo de error
    // por eso sería peor que reabrir vacío.
    await expect(loadSession(workspace)).resolves.toBeNull();
  });

  it('lee lo que se guardó', async () => {
    await writeFile(join(workspace, 'a.ts'), 'const a = 1;\n', 'utf8');
    await flushSessionSave(snapshot({ openTabs: [tab('a.ts', 12)], activeTabIndex: 0 }));

    const loaded = await loadSession(workspace);

    expect(loaded?.openTabs).toHaveLength(1);
    expect(loaded?.openTabs[0]?.cursorPosition.line).toBe(12);
  });

  it('conserva las claves que escribió una versión más nueva', async () => {
    await flushSessionSave(snapshot());

    await writeFile(
      sessionFileFor(workspace),
      JSON.stringify({
        ...snapshot(),
        lastSavedAt: Date.now(),
        watchExpressions: ['i > 3'],
      }),
      'utf8'
    );

    // El ejemplo **era** `breakpoints`, que ya llegó con el DAP y ahora se
    // valida. La laxitud sigue haciendo falta para lo que venga después:
    // rechazar el archivo sería tirar la sesión de alguien que abrió una beta.
    await expect(loadSession(workspace)).resolves.toMatchObject({
      watchExpressions: ['i > 3'],
    });
  });

  it('lee los breakpoints, que ya son una clave conocida', async () => {
    const breakpoint = { path: 'C:\\p\\a.ts', line: 12, enabled: true };

    await flushSessionSave({ ...snapshot(), breakpoints: [breakpoint] });

    await expect(loadSession(workspace)).resolves.toMatchObject({
      breakpoints: [breakpoint],
    });
  });
});

describe('flushSessionSave', () => {
  it('sella el archivo con el momento en que se escribió', async () => {
    const before = Date.now();

    await flushSessionSave(snapshot());

    const loaded = await loadSession(workspace);
    expect(loaded?.lastSavedAt).toBeGreaterThanOrEqual(before);
  });

  it('escribe sin dejar temporales', async () => {
    await flushSessionSave(snapshot());

    const files = await readdir(sessions);

    // Reusa la escritura atómica de RNF-07.
    expect(files.filter((name) => name.endsWith('.tmp'))).toHaveLength(0);
  });
});

describe('planSessionRestore', () => {
  it('descarta las pestañas cuyo archivo ya no existe', async () => {
    await writeFile(join(workspace, 'existe.ts'), '', 'utf8');
    await flushSessionSave(
      snapshot({ openTabs: [tab('borrado.ts'), tab('existe.ts')], activeTabIndex: 0 })
    );

    const saved = await loadSession(workspace);
    const plan = await planSessionRestore(saved ?? { ...snapshot(), lastSavedAt: 0 });

    // El filtrado ocurre del lado que puede mirar el disco: así el renderer
    // nunca intenta abrir algo que no está y RF-707 no depende de que la
    // apertura falle de la forma correcta.
    expect(plan.openTabs).toHaveLength(1);
    expect(plan.openTabs[0]?.uri).toContain('existe.ts');
  });

  it('recalcula el índice activo tras el descarte', async () => {
    await writeFile(join(workspace, 'existe.ts'), '', 'utf8');
    await flushSessionSave(
      snapshot({ openTabs: [tab('borrado.ts'), tab('existe.ts')], activeTabIndex: 1 })
    );

    const saved = await loadSession(workspace);
    const plan = await planSessionRestore(saved ?? { ...snapshot(), lastSavedAt: 0 });

    expect(plan.activeTabIndex).toBe(0);
  });
});
