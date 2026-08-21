import type { Command } from '@pastecode/core';

import { useAiStore } from '../../stores/ai-store.js';
import { useViewStore } from '../../stores/view-store.js';
import { getActiveEditor } from '../editor/monaco-instance.js';

/**
 * Los comandos del asistente.
 *
 * Viven acá y no en `use-app-commands` por el mismo criterio que los de la
 * terminal y los de Git: la feature es dueña de sus acciones, y el archivo que
 * registra los comandos de la app enumera dominios.
 *
 * Es además lo que hace que sacar la [etapa experimental](../../../../../docs/01-vision-y-alcance.md#alcance-experimental)
 * sea borrar una carpeta y una línea.
 *
 * @returns Los comandos, listos para registrar.
 * @example
 * for (const command of aiCommands()) register(command);
 */
export function aiCommands(): readonly Command[] {
  return [
    {
      id: 'ai.toggle',
      title: 'command.aiToggle',
      handler: () => {
        useViewStore.getState().toggleSide('ai');
      },
    },
    {
      id: 'ai.newChat',
      title: 'command.aiNewChat',
      handler: () => {
        const view = useViewStore.getState();
        const ai = useAiStore.getState();

        // Una conversación nueva con una respuesta en curso dejaría el stream
        // pintando sobre un chat vacío.
        void ai.cancel();
        ai.newChat();
        view.showSide('ai');
      },
    },
    {
      id: 'ai.explainSelection',
      title: 'command.aiExplainSelection',
      handler: explainSelection,
    },
  ];
}

/**
 * Le pide al asistente que explique lo que está seleccionado en el editor.
 *
 * Sin selección no hace nada, y no es un error: es el comando pedido en un
 * momento en el que no tiene sujeto. Mandar el archivo entero "por las dudas"
 * gastaría la ventana de contexto en algo que nadie pidió.
 */
function explainSelection(): void {
  const editor = getActiveEditor();
  const model = editor?.getModel();
  const selection = editor?.getSelection();

  if (model === null || model === undefined || selection === null || selection === undefined) {
    return;
  }

  const selected = model.getValueInRange(selection);

  if (selected.trim() === '') return;

  useViewStore.getState().showSide('ai');

  const language = model.getLanguageId();

  void useAiStore
    .getState()
    .send(`Explicame qué hace este código:\n\n\`\`\`${language}\n${selected}\n\`\`\``);
}
