import type { ActivationEvent } from '@pastecode/extension-api';

/**
 * Algo que acaba de pasar y que puede despertar extensiones.
 *
 * Es una unión y no tres funciones porque el punto de los activation events es
 * que quien dispara no sabe a quién despierta: el IDE anuncia lo que pasó y el
 * loader decide. Ver [RF-908](../../../docs/03-requerimientos-funcionales.md).
 */
export type ActivationTrigger =
  | { kind: 'startupFinished' }
  | { kind: 'command'; id: string }
  | { kind: 'language'; languageId: string };

/**
 * Si alguno de los eventos declarados responde a lo que pasó.
 *
 * Es exacto y no por prefijo: `onCommand:wordCount` **no** activa por
 * `wordCount.toggle`. Un match laxo haría que una extensión se despertara con
 * comandos que no son suyos, y el costo de despertarse es cargar y ejecutar
 * código de terceros — que es justamente lo que los activation events existen
 * para postergar.
 *
 * @param events Lo que declaró el manifest.
 * @param trigger Lo que acaba de pasar.
 * @returns `true` si hay que activar la extensión.
 * @example
 * matchesActivation(['onCommand:a.b'], { kind: 'command', id: 'a.b' }); // true
 */
export function matchesActivation(
  events: readonly ActivationEvent[],
  trigger: ActivationTrigger
): boolean {
  return events.some((event) => matchesOne(event, trigger));
}

/** Si un evento suelto responde al trigger. */
function matchesOne(event: ActivationEvent, trigger: ActivationTrigger): boolean {
  if (trigger.kind === 'startupFinished') return event === 'onStartupFinished';
  if (trigger.kind === 'command') return event === `onCommand:${trigger.id}`;

  return event === `onLanguage:${trigger.languageId}`;
}
