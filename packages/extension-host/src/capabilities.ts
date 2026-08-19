import { CapabilityDeniedError } from '@pastecode/core';
import type { Capability } from '@pastecode/extension-api';

/**
 * Verifica que una extensión haya declarado lo que está por usar.
 *
 * Lanza en vez de devolver un booleano porque el resultado de un chequeo que
 * falla es siempre el mismo —no hacer la operación y decir por qué—, y un
 * booleano lo dejaría en manos de cada llamador acordarse de mirarlo. El error
 * viaja por el protocolo como cualquier otro y llega a la extensión con su
 * `code`, así que quien la escribió ve qué falta en el manifest.
 *
 * @param extension El `name` del manifest, para el mensaje.
 * @param granted Lo que el manifest declaró.
 * @param needed La capability que exige la operación.
 * @throws {CapabilityDeniedError} Si no está declarada.
 * @example
 * assertCapability('word-count', manifest.capabilities, 'documentRead');
 */
export function assertCapability(
  extension: string,
  granted: readonly Capability[],
  needed: Capability
): void {
  if (granted.includes(needed)) return;

  throw new CapabilityDeniedError(extension, needed);
}
