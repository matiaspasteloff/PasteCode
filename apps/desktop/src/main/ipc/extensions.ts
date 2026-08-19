import type {
  ExtensionContributionsEvent,
  ExtensionDocumentRequestEvent,
  ExtensionHostChangedEvent,
  ExtensionsChangedEvent,
  Response,
} from '@pastecode/ipc-contract';
import {
  ActiveEditorChangedRequestSchema,
  DocumentResponseRequestSchema,
  ExecuteExtensionCommandRequestSchema,
  GetExtensionHostStatusRequestSchema,
  ListExtensionsRequestSchema,
} from '@pastecode/ipc-contract';
import { BrowserWindow } from 'electron';

import type { ExtensionBroker } from '../extensions/broker.js';
import { createExtensionBroker } from '../extensions/broker.js';
import type { ExtensionHostService } from '../extensions/host-process.js';
import { createExtensionHostService } from '../extensions/host-process.js';
import { registerDisposer } from '../services/shutdown.js';

import { emit } from './emitter.js';
import { registerHandler } from './handler.js';

/**
 * El host y el broker de esta corrida.
 *
 * Son estado de módulo por lo mismo que en `settings` y `keybindings`: hay uno
 * solo por proceso y su ciclo de vida es el de la app. Viven acá y no en
 * `index.ts` para que el arranque no tenga que saber cómo se cablea un evento.
 */
let service: ExtensionHostService | null = null;
let broker: ExtensionBroker | null = null;

/** Manda el estado del host a todas las ventanas. */
function broadcastStatus(status: ExtensionHostChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'extensions:hostChanged', status);
  }
}

/** Ídem para la lista de extensiones cargadas. */
function broadcastExtensions(extensions: ExtensionsChangedEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'extensions:changed', extensions);
  }
}

/** Ídem para lo que las extensiones aportan a la UI. */
function broadcastContributions(contributions: ExtensionContributionsEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    emit(window, 'extensions:contributionsChanged', contributions);
  }
}

/**
 * Le pregunta al renderer por el documento activo.
 *
 * Va a **una** ventana, la primera: el documento activo es el de la ventana con
 * foco, y mandarle la pregunta a todas produciría tantas respuestas como
 * ventanas para un único `requestId`. Ver
 * [ADR-0026](../../../../../docs/adr/0026-broker-unico-y-pull-del-documento-activo.md).
 */
function askRenderer(request: ExtensionDocumentRequestEvent): void {
  const [main] = BrowserWindow.getAllWindows();

  if (main === undefined) return;

  emit(main, 'extensions:documentRequest', request);
}

/** El estado de ahora, o uno apagado si todavía no arrancó. */
function currentStatus(): ExtensionHostChangedEvent {
  return service?.status() ?? { state: 'gaveUp', pid: null, restarts: 0 };
}

/**
 * Registra los handlers del dominio `extensions`.
 *
 * @example
 * registerExtensionsIpcHandlers(); // antes de app.whenReady()
 */
export function registerExtensionsIpcHandlers(): void {
  registerHandler(
    'extensions:getStatus',
    GetExtensionHostStatusRequestSchema,
    (): Response<'extensions:getStatus'> => currentStatus()
  );

  registerHandler(
    'extensions:list',
    ListExtensionsRequestSchema,
    (): Response<'extensions:list'> => service?.extensions() ?? { extensions: [] }
  );

  registerHandler(
    'extensions:executeCommand',
    ExecuteExtensionCommandRequestSchema,
    async (payload): Promise<Response<'extensions:executeCommand'>> => {
      // Va por el main y no directo al host porque el main es el único que
      // sabe quién registró qué, y el único que puede negarlo.
      await service?.rpc().request('host/runCommand', { ...payload, args: [] });

      return {};
    }
  );

  registerHandler(
    'extensions:documentResponse',
    DocumentResponseRequestSchema,
    (payload): Response<'extensions:documentResponse'> => {
      broker?.resolveDocument(payload.requestId, payload.text, payload.applied);

      return {};
    }
  );

  registerHandler(
    'extensions:activeEditorChanged',
    ActiveEditorChangedRequestSchema,
    async (payload): Promise<Response<'extensions:activeEditorChanged'>> => {
      // Un fallo acá no es del renderer: es el host que no está. Se traga,
      // porque el editor va a seguir cambiando y el próximo aviso lo alcanza.
      await service
        ?.rpc()
        .request('host/activeEditorChanged', payload)
        .catch(() => undefined);

      return {};
    }
  );
}

/**
 * Levanta el extension host y lo deja supervisándose solo.
 *
 * Que el host se caiga —o que se rinda después de los tres intentos de
 * [RNF-09](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)—
 * no toca nada del resto del main: el IDE sigue vivo sin extensiones, que es
 * exactamente lo que pide [RF-907](../../../../../docs/03-requerimientos-funcionales.md).
 *
 * @example
 * startExtensionHost(); // dentro de app.whenReady()
 */
export function startExtensionHost(): void {
  broker = createExtensionBroker({
    onContributionsChanged: broadcastContributions,
    askRenderer,
  });

  service = createExtensionHostService({
    onStatusChanged: broadcastStatus,
    onExtensionsChanged: broadcastExtensions,
    broker,
  });

  registerDisposer('extension-host', () => service?.stop() ?? Promise.resolve());
  service.start();
}
