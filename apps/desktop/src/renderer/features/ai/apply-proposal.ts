import { isPathDirty } from '@pastecode/core';
import type { AiToolCallEvent } from '@pastecode/ipc-contract';

import { t } from '../../i18n/index.js';
import { useEditorStore } from '../../stores/editor-store.js';

/** Cómo salió una escritura del asistente. */
export interface ApplyResult {
  outcome: 'applied' | 'failed';
  /** Qué contarle al modelo. Vacío es "no hay nada más que decir". */
  detail: string;
}

/**
 * Escribe lo que propuso el modelo por el canal `fs:*` de siempre.
 *
 * **La escritura la hace el renderer, no el main**, y eso no cambió con
 * [ADR-0032](../../../../../docs/adr/0032-modos-del-asistente-y-edicion-directa.md):
 * es lo que hace que pase por el mismo camino que un `Ctrl+S` —la misma
 * escritura atómica de RNF-07, el mismo `noteOwnWrite` del watcher, la misma
 * validación de ruta en el main—. Lo que cambió es quién aprieta el botón.
 *
 * Vive en un módulo propio y no adentro de `ToolCallCard` porque ahora tiene
 * **dos** llamadores —el botón y el auto-apply del modo agente—, y duplicarla
 * sería un segundo lugar donde arreglar el próximo bug de escritura.
 *
 * Acá viven los dos peligros que el modo agente convierte de raros en
 * constantes: la guarda de buffer sucio **antes** de escribir, y la adopción
 * del contenido en el editor **después**.
 *
 * @param call La propuesta, tal como llegó por `ai:toolCall`.
 * @returns Si se escribió, y qué contarle al modelo.
 * @example
 * const { outcome, detail } = await applyProposal(call);
 */
export async function applyProposal(call: AiToolCallEvent): Promise<ApplyResult> {
  // **Peligro 1.** `fs:writeFile` va sin `expectedMtimeMs`, así que una
  // pestaña con cambios sin guardar se pisaría en el disco y el `Ctrl+S`
  // siguiente volvería a pisar lo que escribió el asistente. El único final
  // bueno de esa carrera es no correrla: se le informa al modelo y decide.
  if (isPathDirty(useEditorStore.getState().groups, call.path)) {
    return { outcome: 'failed', detail: t('ai.dirtyBuffer') };
  }

  const created = await createIfNeeded(call);

  if (created !== null) return created;

  const written = await window.pastecode.invoke('fs:writeFile', {
    path: call.path,
    content: call.nextContent,
  });

  if (!written.ok) return { outcome: 'failed', detail: written.error.userMessage };

  // **Peligro 2.** `fs:writeFile` llama a `noteOwnWrite`, así que el watcher
  // se traga el evento y `applyExternalChanges` nunca corre: sin esto, una
  // pestaña abierta y limpia se queda mostrando el contenido viejo.
  useEditorStore
    .getState()
    .adoptExternalWrite(call.path, call.nextContent, written.value.mtimeMs);

  return { outcome: 'applied', detail: '' };
}

/**
 * Contesta un `ai:toolCall` por el canal `ai:toolResult`.
 *
 * Es la mitad renderer → main del pull de ADR-0026, y hace falta siempre —con
 * confirmación o sin ella—: el loop del agente está esperando este mensaje
 * para saber si el archivo cambió antes de seguir razonando.
 *
 * @param call La propuesta que se está contestando.
 * @param outcome Qué pasó con ella.
 * @param detail Qué contarle al modelo, o vacío.
 * @example
 * await reportToolOutcome(call, 'applied', '');
 */
export async function reportToolOutcome(
  call: AiToolCallEvent,
  outcome: 'applied' | 'discarded' | 'failed',
  detail: string
): Promise<void> {
  await window.pastecode.invoke('ai:toolResult', {
    requestId: call.requestId,
    toolCallId: call.toolCallId,
    outcome,
    detail,
  });
}

/**
 * Crea el archivo si la propuesta es una creación.
 *
 * Se crea vacío y se escribe después: `fs:createFile` es creación exclusiva
 * —falla si ya existe, que es la mitad de su valor— y no acepta contenido.
 *
 * @returns El fallo, o `null` si no hay nada que reportar y se puede escribir.
 */
async function createIfNeeded(call: AiToolCallEvent): Promise<ApplyResult | null> {
  if (call.previousContent !== null) return null;

  const created = await window.pastecode.invoke('fs:createFile', { path: call.path });

  return created.ok ? null : { outcome: 'failed', detail: created.error.userMessage };
}
