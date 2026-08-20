import { PasteCodeError } from './pastecode-error.js';

/**
 * Una extensión pidió algo que su manifest no declara.
 *
 * Es un error y no un valor vacío a propósito: quien lo lee es quien escribió
 * la extensión, y "acceso denegado, falta declarar `documentWrite`" se arregla
 * en un renglón del manifest. Un `undefined` silencioso se depura durante una
 * tarde.
 *
 * El chequeo vive **en el main**, que es el único proceso que lo puede hacer
 * cumplir: el host corre el código de terceros, así que una verificación del
 * lado del host la escribiría el mismo que se la quiere saltear
 * ([RNF-14](../../../../docs/04-requerimientos-no-funcionales.md)).
 *
 * @example
 * throw new CapabilityDeniedError('word-count', 'documentWrite');
 */
export class CapabilityDeniedError extends PasteCodeError {
  constructor(extension: string, capability: string) {
    super(
      `Extension "${extension}" did not declare capability: ${capability}`,
      'CAPABILITY_DENIED',
      `La extensión "${extension}" intentó algo que no declaró en su manifest ("${capability}"). No se le permitió.`
    );
  }
}
