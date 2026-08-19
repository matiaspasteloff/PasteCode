import type { ExtensionContributionsEvent } from '@pastecode/ipc-contract';

import { useCommandStore } from '../../stores/command-store.js';

/**
 * Deja el registro con exactamente los comandos que aportan las extensiones.
 *
 * Se recalcula entero en vez de aplicar un delta porque el evento trae el
 * estado resuelto: reconstruir a partir de deltas es lo que deja media
 * extensión en la paleta cuando se pierde un evento.
 *
 * **Sólo se registra lo que falta.** `CommandRegistry.register` lanza ante un
 * id repetido, y el evento llega una vez por cada cambio de contribución —una
 * extensión que actualiza su ítem de la barra republica también sus comandos—,
 * así que volver a registrar lo que ya estaba tiraba una excepción que se comía
 * el resto del listener. El síntoma era la status bar congelada en su primer
 * valor, que no se parece en nada a la causa.
 */
export function syncCommands(commands: ExtensionContributionsEvent['commands']): void {
  const store = useCommandStore.getState();
  const wanted = new Map(commands.map((command) => [prefixed(command.id), command]));
  const registered = new Set<string>();

  for (const { id } of store.registry.list()) {
    if (!id.startsWith(EXTENSION_PREFIX)) continue;

    if (wanted.has(id)) registered.add(id);
    else store.unregister(id);
  }

  for (const [id, command] of wanted) {
    if (registered.has(id)) continue;

    store.register({
      id,
      title: command.title,
      ...(command.category === undefined ? {} : { category: command.category }),
      handler: async () => {
        await window.pastecode.invoke('extensions:executeCommand', {
          extension: command.extension,
          id: command.id,
        });
      },
    });
  }
}

/** El id con el que un comando de extensión vive en el registro. */
function prefixed(id: string): string {
  return `${EXTENSION_PREFIX}${id}`;
}

/**
 * Con qué se marcan los comandos que vienen de una extensión.
 *
 * Sin prefijo, una extensión podría registrar `file.save` y quedarse con el
 * atajo de guardar. El registro rechaza duplicados, así que el efecto sería una
 * extensión que no carga por chocar con un comando de fábrica —o peor, al
 * revés—. Con prefijo el espacio de nombres es de ellas y el choque no existe.
 */
const EXTENSION_PREFIX = 'ext:';
