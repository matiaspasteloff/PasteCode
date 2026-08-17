import { LoadSessionRequestSchema, SaveSessionRequestSchema } from '@pastecode/ipc-contract';

import {
  disposeSession,
  flushSessionSave,
  loadSession,
  planSessionRestore,
  scheduleSessionSave,
} from '../services/session.js';
import { getWorkspace, requireWorkspaceRoot } from '../services/workspace.js';

import { registerHandler } from './handler.js';

/**
 * Lo último que mandó el renderer, para poder escribirlo al cerrar.
 *
 * Sin esto, el debounce de 2 segundos se come lo que alguien hizo justo antes
 * de cerrar la app —que es lo que más se nota, porque es lo último que
 * recuerda haber hecho—.
 */
let lastReported: Parameters<typeof scheduleSessionSave>[0] | undefined;

/**
 * Escribe la sesión pendiente ahora mismo. La llama `before-quit`.
 *
 * @example
 * await flushSession();
 */
export async function flushSession(): Promise<void> {
  if (lastReported === undefined) {
    disposeSession();
    return;
  }

  await flushSessionSave(lastReported);
}

/**
 * Registra los handlers del dominio `session`.
 *
 * @example
 * registerSessionIpcHandlers(); // antes de app.whenReady()
 */
export function registerSessionIpcHandlers(): void {
  registerHandler('session:load', LoadSessionRequestSchema, async () => {
    const workspace = getWorkspace();

    // Sin workspace no hay sesión que restaurar. No es un error: es el estado
    // de una app recién instalada.
    if (workspace === null) return { state: null };

    const saved = await loadSession(workspace.root);
    if (saved === null) return { state: null };

    // Se filtra acá, del lado que puede mirar el disco. El renderer recibe
    // sólo pestañas abribles, así que el descarte silencioso de RF-707 no
    // depende de que la apertura falle de la forma correcta.
    const plan = await planSessionRestore(saved);

    return {
      state: {
        openTabs: [...plan.openTabs],
        activeTabIndex: plan.activeTabIndex,
        expandedFolders: [...plan.expandedFolders],
        // Las claves se omiten en vez de mandarse en `undefined`: el schema es
        // estricto y con `exactOptionalPropertyTypes` no son lo mismo.
        ...(plan.groups === undefined ? {} : { groups: [...plan.groups] }),
        ...(plan.layout === undefined ? {} : { layout: plan.layout }),
        ...(plan.activeGroupId === undefined ? {} : { activeGroupId: plan.activeGroupId }),
      },
    };
  });

  registerHandler('session:save', SaveSessionRequestSchema, (payload) => {
    lastReported = { ...payload, rootPath: requireWorkspaceRoot() };
    scheduleSessionSave(lastReported);

    return {};
  });
}
