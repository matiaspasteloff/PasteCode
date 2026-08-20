import { PasteCodeError } from './pastecode-error.js';

/**
 * Una llamada al extension host no contestó a tiempo.
 *
 * Es el techo de 5 s del [modelo de amenazas](../../../../docs/convenciones/seguridad.md#modelo-de-amenazas--extensiones)
 * convertido en error. Casi siempre significa que una extensión se colgó
 * adentro de su handler, así que el `userMessage` nombra a la extensión y no al
 * IDE: quien puede hacer algo al respecto es quien la instaló.
 *
 * @example
 * throw new ExtensionCallTimeoutError('wordCount.toggle', 5000);
 */
export class ExtensionCallTimeoutError extends PasteCodeError {
  constructor(method: string, timeoutMs: number) {
    super(
      `Extension host call timed out after ${String(timeoutMs)}ms: ${method}`,
      'EXTENSION_CALL_TIMEOUT',
      'Una extensión tardó demasiado en responder y se canceló la operación. El resto del IDE sigue funcionando.'
    );
  }
}

/**
 * El extension host no está disponible: murió, se está reiniciando, o se rindió.
 *
 * Que sea un error y no una espera es deliberado. Encolar las llamadas hasta
 * que el host vuelva parece más amable, pero convierte un host que se rindió
 * —tres crashes seguidos, [RNF-09](../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)—
 * en una cola que crece para siempre. Fallar rápido deja el IDE usable sin
 * extensiones, que es exactamente lo que [RF-907](../../../../docs/03-requerimientos-funcionales.md)
 * pide.
 *
 * @example
 * throw new ExtensionHostUnavailableError('el host se está reiniciando');
 */
export class ExtensionHostUnavailableError extends PasteCodeError {
  constructor(reason: string) {
    super(
      `Extension host unavailable: ${reason}`,
      'EXTENSION_HOST_UNAVAILABLE',
      'Las extensiones no están disponibles en este momento. El resto del IDE sigue funcionando.'
    );
  }
}
