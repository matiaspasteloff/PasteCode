import {
  AiChatRequestSchema,
  AiKeyStatusRequestSchema,
  AiToolResultRequestSchema,
  CancelAiRequestSchema,
  ClearAiApiKeyRequestSchema,
  ListAiModelsRequestSchema,
  SetAiApiKeyRequestSchema,
} from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import { cancelAgent, cancelAllAgents, resolveToolCall, runAgent } from '../ai/agent.js';
import { canPersistApiKey, clearApiKey, loadApiKey, saveApiKey } from '../ai/credentials.js';
import { forgetCatalog, listFreeModels } from '../ai/openrouter.js';
import { registerDisposer } from '../services/shutdown.js';

import { registerHandler } from './handler.js';

/**
 * Registra los handlers del dominio `ai`.
 *
 * **El asistente es una [etapa experimental](../../../../../docs/01-vision-y-alcance.md#alcance-experimental)**,
 * y esto es todo lo que el main sabe de él: siete canales y un disposer. Sacar
 * la feature es no llamar a esta función y borrar `main/ai/`.
 *
 * @example
 * registerAiIpcHandlers(); // antes de app.whenReady()
 */
export function registerAiIpcHandlers(): void {
  // Un `fetch` en vuelo no es un proceso hijo, pero deja la promesa del agente
  // sin resolver y la app esperándola en el cierre. Es el mismo motivo por el
  // que la búsqueda registra el suyo: RNF-10 es "cero huérfanos", y una
  // conexión abierta contra un servidor que va a seguir escribiendo cuenta.
  registerDisposer('ai', () => {
    cancelAllAgents();
  });

  registerHandler('ai:listModels', ListAiModelsRequestSchema, async () => ({
    models: await listFreeModels(),
  }));

  registerHandler('ai:chat', AiChatRequestSchema, (payload) => {
    const window = BrowserWindow.getAllWindows()[0];

    // Sin ventana no hay a quién mandarle los eventos, y toda la respuesta
    // viaja por eventos. Arrancar sería quemar cuota contra nadie.
    if (window === undefined) return {};

    // **Deliberadamente sin `await`**: este canal arranca la respuesta, no la
    // espera. Lo que importa viaja por `ai:delta` y `ai:done`; devolver recién
    // cuando la respuesta terminó dejaría el `invoke` colgado quince segundos
    // y el renderer sin nada que pintar mientras tanto.
    void runAgent(payload, window);

    return {};
  });

  registerHandler('ai:cancel', CancelAiRequestSchema, (payload) => {
    cancelAgent(payload.requestId);

    return {};
  });

  registerHandler('ai:toolResult', AiToolResultRequestSchema, (payload) => {
    resolveToolCall(payload);

    return {};
  });

  registerAiCredentialHandlers();
}

/**
 * Los tres canales de la clave.
 *
 * Van aparte porque son la parte con reglas propias: la clave entra por uno,
 * **nunca sale por ninguno**, y el estado que se devuelve es un booleano.
 */
function registerAiCredentialHandlers(): void {
  registerHandler('ai:setApiKey', SetAiApiKeyRequestSchema, async (payload) => {
    await saveApiKey(payload.apiKey);

    // La clave nueva puede ser de otra cuenta, y el catálogo de gratuitos es
    // por cuenta: quedarse con el anterior haría que un modelo que esta clave
    // no tiene siguiera apareciendo en el selector.
    forgetCatalog();

    return {};
  });

  registerHandler('ai:getKeyStatus', AiKeyStatusRequestSchema, async () => ({
    // Un booleano, no la clave, ni siquiera enmascarada (RF-1003).
    hasKey: (await loadApiKey()) !== null,
    canPersist: canPersistApiKey(),
  }));

  registerHandler('ai:clearApiKey', ClearAiApiKeyRequestSchema, async () => {
    await clearApiKey();
    forgetCatalog();

    return {};
  });
}
