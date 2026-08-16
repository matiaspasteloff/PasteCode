/**
 * Las clases de ítem de completado, como unión de literales.
 *
 * No es el número del protocolo ni el enum de Monaco: es un nombre estable en
 * el medio. El número de LSP y el de Monaco **no coinciden** —`Method` es 2 en
 * uno y 0 en el otro—, así que pasar el número crudo por el IPC sería mandar un
 * dato cuyo significado depende de quién lo lea. El día que Monaco reordene su
 * enum, lo que cambia es una tabla del renderer y no el contrato.
 */
export const COMPLETION_KINDS = [
  'text',
  'method',
  'function',
  'constructor',
  'field',
  'variable',
  'class',
  'interface',
  'module',
  'property',
  'unit',
  'value',
  'enum',
  'keyword',
  'snippet',
  'color',
  'file',
  'reference',
  'folder',
  'enumMember',
  'constant',
  'struct',
  'event',
  'operator',
  'typeParameter',
] as const;

export type CompletionItemKind = (typeof COMPLETION_KINDS)[number];

/**
 * Traduce el `CompletionItemKind` del protocolo al nombre del contrato.
 *
 * Los valores de LSP son 1 a 25 **en el orden de `COMPLETION_KINDS`**, así que
 * la traducción es un índice y no una tabla de veinticinco entradas escrita a
 * mano, que es una tabla de veinticinco oportunidades de equivocarse.
 *
 * @param kind El número del protocolo, o `undefined` si el servidor no lo mandó.
 * @returns El nombre, o `'text'` para lo desconocido —que es lo que dice la
 * spec que significa la ausencia—.
 * @example
 * completionKindFromLsp(3); // 'function'
 * completionKindFromLsp(undefined); // 'text'
 */
export function completionKindFromLsp(kind: number | undefined): CompletionItemKind {
  if (kind === undefined) return 'text';

  return COMPLETION_KINDS[kind - 1] ?? 'text';
}
