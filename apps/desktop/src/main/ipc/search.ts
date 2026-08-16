import type { SearchDoneEvent, SearchResultEvent } from '@pastecode/ipc-contract';
import { CancelSearchRequestSchema, StartSearchRequestSchema } from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import { cancelSearch, startSearch } from '../services/search.js';
import { currentSettings } from '../services/settings.js';
import { registerDisposer } from '../services/shutdown.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/** Manda un evento de búsqueda a todas las ventanas. */
function broadcastResult(event: SearchResultEvent): void {
  for (const window of BrowserWindow.getAllWindows()) emit(window, 'search:result', event);
}

/** Ídem para el final de la búsqueda. */
function broadcastDone(event: SearchDoneEvent): void {
  for (const window of BrowserWindow.getAllWindows()) emit(window, 'search:done', event);
}

/**
 * Registra los handlers del dominio `search`.
 *
 * @example
 * registerSearchIpcHandlers(); // antes de app.whenReady()
 */
export function registerSearchIpcHandlers(): void {
  // Sin esto, cerrar la app en medio de una búsqueda deja el `rg` vivo y
  // adoptado por el sistema. Es una violación de RNF-10 que pasaba
  // desapercibida porque ripgrep casi siempre gana la carrera y termina solo;
  // sobre un repositorio grande, no.
  registerDisposer('search', () => {
    cancelSearch();
  });

  registerHandler('search:start', StartSearchRequestSchema, (payload) => {
    const { searchId } = payload;

    startSearch(
      {
        query: payload.query,
        isRegex: payload.isRegex,
        isCaseSensitive: payload.isCaseSensitive,
        matchWholeWord: payload.matchWholeWord,
        includeGlobs: payload.includeGlobs,
        // RF-005: la misma clave que filtra el árbol filtra la búsqueda. El
        // schema no tiene una sección `search.*` a propósito.
        excludeGlobs: currentSettings().files.exclude,
      },
      requireWorkspaceRoot(),
      {
        onResult: (matches) => {
          broadcastResult({ searchId, matches });
        },
        onDone: ({ truncated, error }) => {
          broadcastDone({
            searchId,
            truncated,
            error: error === null ? null : { code: error.code, userMessage: error.userMessage },
          });
        },
      }
    );

    return {};
  });

  registerHandler('search:cancel', CancelSearchRequestSchema, () => {
    cancelSearch();

    return {};
  });
}
