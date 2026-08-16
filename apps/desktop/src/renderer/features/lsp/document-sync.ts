import type * as MonacoApi from 'monaco-editor/editor/editor.api';

import { useProblemsStore } from '../../stores/problems-store.js';
import { getLoadedMonaco } from '../editor/monaco-instance.js';

import { applyMarkers } from './markers.js';

/**
 * Qué servidor atiende cada documento abierto.
 *
 * Vive afuera de un store porque no se pinta: es la respuesta de
 * `lsp:openDocument`, y sirve para no mandar `didChange` de archivos que no
 * tienen servidor. Un `.md` abierto no tiene por qué cruzar el IPC en cada
 * tecla para que del otro lado lo descarten.
 */
const serverByPath = new Map<string, string>();

/**
 * Le avisa al main que hay un documento abierto.
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

  if (result.value.serverId === null) serverByPath.delete(path);
  else serverByPath.set(path, result.value.serverId);

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

  if (!serverByPath.has(path)) return;

  serverByPath.delete(path);
  await window.pastecode.invoke('lsp:closeDocument', { path });
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

/** Olvida el mapa de servidores. Se llama al cambiar de workspace. */
export function forgetLspDocuments(): void {
  serverByPath.clear();
}
