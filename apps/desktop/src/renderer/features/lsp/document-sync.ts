import type { DocumentChange } from '@pastecode/ipc-contract';
import type * as MonacoApi from 'monaco-editor/editor/editor.api';

import { useProblemsStore } from '../../stores/problems-store.js';
import { getLoadedMonaco } from '../editor/monaco-instance.js';

import { applyMarkers } from './markers.js';

/**
 * Cuánto se espera después de la última tecla antes de descargar los cambios.
 *
 * **El renderer no invoca por tecla**, y es la primera regla de esta feature
 * por orden de importancia: un salto de proceso por pulsación es trabajo en el
 * hilo de UI justo cuando alguien escribe, que es el peor momento posible para
 * gastar el presupuesto de 16ms de
 * [RNF-02](../../../../../docs/04-requerimientos-no-funcionales.md#performance).
 * Diagnósticos 50ms tarde son invisibles; un frame perdido no.
 */
const DEBOUNCE_MS = 50;

/**
 * Techo del debounce.
 *
 * Sin él, escribir sin parar durante un minuto no manda nada en todo ese
 * minuto: cada tecla reagenda el temporizador. El techo garantiza que el
 * servidor vea el documento al menos cinco veces por segundo mientras se tipea.
 */
const MAX_DELAY_MS = 200;

/** Lo que se sabe de un documento que el LSP está siguiendo. */
interface TrackedDocument {
  readonly model: MonacoApi.editor.ITextModel;
  readonly subscription: MonacoApi.IDisposable;
  /** Los cambios acumulados desde la última descarga, en orden. */
  changes: DocumentChange[];
  timer: ReturnType<typeof setTimeout> | null;
  /** Cuándo vence el techo de `MAX_DELAY_MS`. */
  ceiling: number;
}

/**
 * Los documentos que un servidor está atendiendo, por ruta.
 *
 * Vive afuera de un store porque no se pinta. Que un `.md` abierto no esté acá
 * es lo que evita que cruce el IPC en cada tecla para que del otro lado lo
 * descarten.
 */
const tracked = new Map<string, TrackedDocument>();

/**
 * Le avisa al main que hay un documento abierto y empieza a seguir sus cambios.
 *
 * Se dispara desde `onDidCreateModel` y no desde la apertura de una pestaña: un
 * modelo puede nacer por una restauración de sesión, sin que nadie lo mire
 * todavía, y el servidor tiene que saberlo igual para poder analizarlo.
 *
 * Al abrir se pintan además los marcadores que ya estuvieran guardados: los
 * diagnósticos de un archivo pueden haber llegado antes de que alguien lo
 * abriera, y sin esto el subrayado aparecería recién al siguiente cambio.
 *
 * @param model El modelo recién creado.
 * @example
 * monaco.editor.onDidCreateModel((model) => { void openLspDocument(model); });
 */
export async function openLspDocument(model: MonacoApi.editor.ITextModel): Promise<void> {
  const path = model.uri.fsPath;

  const result = await window.pastecode.invoke('lsp:openDocument', {
    path,
    languageId: model.getLanguageId(),
    version: model.getVersionId(),
    text: model.getValue(),
  });

  if (!result.ok) return;

  if (result.value.serverId === null) {
    untrack(path);
    return;
  }

  // Reabrir después de un reinicio pasa por acá otra vez: sin esta guarda
  // quedarían dos suscripciones sobre el mismo modelo y cada tecla mandaría
  // sus cambios dos veces, que es exactamente cómo se desincroniza un servidor.
  if (!tracked.has(path)) track(path, model);

  const stored = useProblemsStore.getState().byPath.get(path);

  if (stored !== undefined) applyMarkers(path, stored.diagnostics);
}

/**
 * Le avisa al main que el documento se cerró.
 *
 * Sin esto el servidor sigue analizando un archivo que nadie mira, que es
 * trabajo constante y memoria retenida del lado del `tsserver` (RNF-04).
 *
 * @param model El modelo que está por desecharse.
 * @example
 * monaco.editor.onWillDisposeModel((model) => { void closeLspDocument(model); });
 */
export async function closeLspDocument(model: MonacoApi.editor.ITextModel): Promise<void> {
  const path = model.uri.fsPath;

  if (!tracked.has(path)) return;

  untrack(path);
  await window.pastecode.invoke('lsp:closeDocument', { path });
}

/**
 * Descarga ahora mismo los cambios pendientes de un archivo.
 *
 * **Toda request de completado, hover o definición llama a esto primero.** Es
 * una línea y elimina la clase entera de bugs de "me sugiere el identificador
 * que acabo de borrar": sin ella, el servidor contesta sobre el documento que
 * tenía hace hasta 50ms, que en medio de una palabra es otro documento.
 *
 * @param path Ruta absoluta del archivo.
 * @returns Cuando el main aceptó los cambios, o enseguida si no había ninguno.
 * @example
 * await flushDocumentChanges(path);
 */
export async function flushDocumentChanges(path: string): Promise<void> {
  const document = tracked.get(path);

  if (document === undefined) return;

  if (document.timer !== null) {
    clearTimeout(document.timer);
    document.timer = null;
  }

  if (document.changes.length === 0) return;

  const changes = document.changes;

  document.changes = [];

  await window.pastecode.invoke('lsp:changeDocument', {
    path,
    // La versión se lee al descargar y no al acumular: es la del documento que
    // resulta de aplicar exactamente estos cambios, y es contra ella que el
    // main descarta las descargas viejas.
    version: document.model.getVersionId(),
    changes,
  });
}

/** Si el archivo tiene un servidor que lo atienda. */
export function hasLanguageServer(path: string): boolean {
  return tracked.has(path);
}

/**
 * Reabre todos los modelos vivos.
 *
 * Es la contraparte de que el main **no guarde el texto** de los documentos
 * abiertos: un servidor reiniciado no sabe nada, y el único lado que tiene el
 * contenido es éste. Se reabren todos y no sólo los del servidor que volvió
 * porque el mapa de qué servidor atendía a quién se pierde con el reinicio; los
 * que no tengan servidor los descarta el main en una línea.
 *
 * @example
 * window.pastecode.subscribe('lsp:serverChanged', ({ server }) => {
 *   if (server.state === 'running') void reopenAllDocuments();
 * });
 */
export async function reopenAllDocuments(): Promise<void> {
  const monaco = getLoadedMonaco();

  if (monaco === null) return;

  await Promise.all(monaco.editor.getModels().map((model) => openLspDocument(model)));
}

/** Deja de seguir todos los documentos. Se llama al cambiar de workspace. */
export function forgetLspDocuments(): void {
  for (const path of [...tracked.keys()]) untrack(path);
}

/** Empieza a seguir los cambios de un modelo. */
function track(path: string, model: MonacoApi.editor.ITextModel): void {
  const subscription = model.onDidChangeContent((event) => {
    noteChanges(path, event);
  });

  tracked.set(path, {
    model,
    subscription,
    changes: [],
    timer: null,
    ceiling: 0,
  });
}

/** Deja de seguirlo y tira lo pendiente. */
function untrack(path: string): void {
  const document = tracked.get(path);

  if (document === undefined) return;

  if (document.timer !== null) clearTimeout(document.timer);
  document.subscription.dispose();
  tracked.delete(path);
}

/**
 * Acumula los cambios de un evento y reagenda la descarga.
 *
 * Los cambios de Monaco se pasan **en el orden en que vienen**, que es de atrás
 * hacia adelante en el documento. No es un detalle cosmético: LSP aplica los
 * cambios de un lote en secuencia, cada uno sobre el resultado del anterior, y
 * empezar por el final es lo que hace que los desplazamientos de los que
 * quedan sigan siendo válidos. Reordenarlos o mandarlos de a uno por evento
 * rompe cualquier edición multi-cursor.
 */
function noteChanges(path: string, event: MonacoApi.editor.IModelContentChangedEvent): void {
  const document = tracked.get(path);

  if (document === undefined) return;

  if (document.changes.length === 0) document.ceiling = Date.now() + MAX_DELAY_MS;

  for (const change of event.changes) {
    document.changes.push({
      range: {
        // Monaco ya trabaja en base 1, igual que el contrato: la única
        // conversión del proyecto vive en `main/lsp` y no llega hasta acá.
        start: { line: change.range.startLineNumber, column: change.range.startColumn },
        end: { line: change.range.endLineNumber, column: change.range.endColumn },
      },
      text: change.text,
    });
  }

  if (document.timer !== null) clearTimeout(document.timer);

  const delay = Math.max(0, Math.min(DEBOUNCE_MS, document.ceiling - Date.now()));

  document.timer = setTimeout(() => {
    document.timer = null;
    void flushDocumentChanges(path);
  }, delay);
}
