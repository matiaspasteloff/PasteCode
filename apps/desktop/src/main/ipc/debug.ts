import type { Response } from '@pastecode/ipc-contract';
import {
  GetDebugStatusRequestSchema,
  GetLaunchConfigurationsRequestSchema,
} from '@pastecode/ipc-contract';

import { readLaunchConfigurations } from '../debug/launch-file.js';
import { resolveAdapter } from '../debug/resolve-adapter.js';
import { currentSettings } from '../services/settings.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

import { registerHandler } from './handler.js';

/**
 * Registra los handlers del dominio `debug`.
 *
 * @example
 * registerDebugIpcHandlers(); // antes de app.whenReady()
 */
export function registerDebugIpcHandlers(): void {
  registerHandler(
    'debug:getConfigurations',
    GetLaunchConfigurationsRequestSchema,
    async (): Promise<Response<'debug:getConfigurations'>> =>
      readLaunchConfigurations(requireWorkspaceRoot())
  );

  registerHandler(
    'debug:getStatus',
    GetDebugStatusRequestSchema,
    (): Response<'debug:getStatus'> => {
      const resolved = resolveAdapter(currentSettings(), process.execPath, process.env);

      // Sin adaptador el debugging queda **apagado con explicación**, no roto:
      // es el mismo estado que un servidor de lenguaje sin instalar, y el resto
      // del IDE no se entera.
      if ('problem' in resolved) {
        return {
          state: 'unavailable',
          userMessage: resolved.problem.userMessage,
          threadId: null,
        };
      }

      return { state: 'idle', userMessage: null, threadId: null };
    }
  );
}
