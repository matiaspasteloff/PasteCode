import { pathToFileURL } from 'node:url';

import type { DocumentPosition, DocumentRange } from '@pastecode/core';
import { toLspPosition } from '@pastecode/core';
import type { CompletionItem, DefinitionLocation } from '@pastecode/ipc-contract';
import type {
  CompletionItem as LspCompletionItem,
  CompletionList,
  Definition,
  DefinitionLink,
  Hover,
} from 'vscode-languageserver-protocol';

import { clientById, clientForPath } from './registry.js';
import {
  completionItemsOf,
  isIncompleteCompletion,
  toCompletionItem,
  toDefinitionLocations,
  toHoverResponse,
} from './translate.js';

/**
 * La última respuesta de completado de cada servidor, cruda.
 *
 * `completionItem/resolve` espera recibir de vuelta el objeto entero del
 * servidor, con su campo `data` opaco adentro. Hacerlo viajar al renderer y
 * volver es pasear un dato de un binario de terceros por una frontera de
 * seguridad para nada, así que el main se queda con la respuesta y el renderer
 * con un número. Se guarda **sólo la última**: un ítem de una lista que ya se
 * reemplazó no lo va a resolver nadie.
 *
 * No hace falta vaciarlo al apagar los servidores. Un `id` de una lista vieja
 * sólo se resuelve si además hay un cliente vivo con ese `serverId`, y esa es
 * la guarda que importa; lo que queda en el mapa mientras tanto es una lista
 * por servidor.
 */
const lastCompletion = new Map<string, LspCompletionItem[]>();

/** Los parámetros de posición que comparten los tres métodos. */
function positionParams(path: string, position: DocumentPosition): Record<string, unknown> {
  return {
    textDocument: { uri: pathToFileURL(path).toString() },
    position: toLspPosition(position),
  };
}

/**
 * Pide el completado en una posición.
 *
 * @param path Ruta absoluta, ya validada contra el workspace.
 * @param position Posición base 1.
 * @param triggerCharacter El carácter que lo disparó, o `null` si fue explícito.
 * @returns Los ítems, o una lista vacía si no hay servidor.
 * @example
 * await requestCompletion(path, { line: 3, column: 8 }, '.');
 */
export async function requestCompletion(
  path: string,
  position: DocumentPosition,
  triggerCharacter: string | null
): Promise<{ isIncomplete: boolean; items: CompletionItem[] }> {
  const client = clientForPath(path);

  if (client === null) return { isIncomplete: false, items: [] };

  const result = await client.request<CompletionList | LspCompletionItem[] | null>(
    'textDocument/completion',
    {
      ...positionParams(path, position),
      // `triggerKind` 1 es "lo pidió la persona", 2 es "lo disparó un carácter".
      context:
        triggerCharacter === null ? { triggerKind: 1 } : { triggerKind: 2, triggerCharacter },
    }
  );

  const items = completionItemsOf(result ?? null);

  lastCompletion.set(client.serverId, items);

  return {
    isIncomplete: isIncompleteCompletion(result ?? null),
    items: items.map(toCompletionItem),
  };
}

/**
 * Completa la documentación de un ítem que el servidor mandó a medias.
 *
 * @param serverId Qué servidor lo produjo.
 * @param id Índice del ítem en la última respuesta de ese servidor.
 * @returns El ítem resuelto, o `null` si la lista ya se reemplazó.
 * @example
 * await resolveCompletion('typescript', 4);
 */
export async function resolveCompletion(
  serverId: string,
  id: number
): Promise<{ item: CompletionItem | null }> {
  const original = lastCompletion.get(serverId)?.[id];

  if (original === undefined) return { item: null };

  // Se lo busca por `serverId` y no por ruta porque resolver es sobre el
  // servidor que produjo la lista, no sobre el archivo: puede haber cambiado
  // la pestaña entre que se abrió el popup y que alguien se paró en un ítem.
  const client = clientById(serverId);

  if (client === null) return { item: null };

  const resolved = await client.request<LspCompletionItem | null>(
    'completionItem/resolve',
    original
  );

  return { item: toCompletionItem(resolved ?? original, id) };
}

/**
 * Pide el hover en una posición ([RF-404](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * @param path Ruta absoluta, ya validada.
 * @param position Posición base 1.
 * @returns El markdown y su rango, o `null` en los dos si no hay nada.
 * @example
 * await requestHover(path, { line: 3, column: 8 });
 */
export async function requestHover(
  path: string,
  position: DocumentPosition
): Promise<{ contents: string | null; range: DocumentRange | null }> {
  const client = clientForPath(path);

  if (client === null) return { contents: null, range: null };

  const hover = await client.request<Hover | null>(
    'textDocument/hover',
    positionParams(path, position)
  );

  return toHoverResponse(hover ?? null);
}

/**
 * Pide la definición de un símbolo ([RF-405](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * @param path Ruta absoluta, ya validada.
 * @param position Posición base 1.
 * @returns Las ubicaciones que apuntan a archivos del disco.
 * @example
 * await requestDefinition(path, { line: 3, column: 8 });
 */
export async function requestDefinition(
  path: string,
  position: DocumentPosition
): Promise<{ locations: DefinitionLocation[] }> {
  const client = clientForPath(path);

  if (client === null) return { locations: [] };

  const definition = await client.request<Definition | DefinitionLink[] | null>(
    'textDocument/definition',
    positionParams(path, position)
  );

  return { locations: toDefinitionLocations(definition ?? null) };
}
