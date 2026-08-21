import { PasteCodeError } from './pastecode-error.js';

/**
 * No hay clave de API configurada.
 *
 * Es el estado normal de una instalación recién hecha, no una falla: la
 * [etapa experimental](../../../../docs/01-vision-y-alcance.md#alcance-experimental)
 * es opt-in, así que sin clave el asistente no hace una sola llamada de red.
 * Por eso el `userMessage` dice qué hacer y no qué salió mal.
 *
 * @example
 * throw new MissingApiKeyError();
 */
export class MissingApiKeyError extends PasteCodeError {
  constructor() {
    super(
      'No OpenRouter API key configured',
      'AI_MISSING_API_KEY',
      'Configurá tu clave de OpenRouter para usar el asistente. Es gratis y sólo se ofrecen modelos sin costo.'
    );
  }
}

/**
 * El almacenamiento cifrado del sistema no está disponible.
 *
 * `safeStorage.isEncryptionAvailable()` da falso en sesiones de Linux sin
 * keyring y en algunos entornos de CI. **No hay fallback a texto plano**: una
 * clave de API en un archivo legible es peor que no poder guardarla, porque
 * quien la guarda cree que está protegida.
 *
 * @example
 * throw new EncryptionUnavailableError();
 */
export class EncryptionUnavailableError extends PasteCodeError {
  constructor() {
    super(
      'safeStorage encryption is not available on this system',
      'AI_ENCRYPTION_UNAVAILABLE',
      'Este sistema no ofrece almacenamiento cifrado, así que la clave no se guarda. Podés pegarla en cada sesión.'
    );
  }
}

/**
 * La llamada a OpenRouter falló.
 *
 * El `status` viaja en el `message` técnico y **también** decide el
 * `userMessage`, porque los tres casos que importan se distinguen y se
 * resuelven distinto: 401 es una clave mal escrita, 429 es el límite de tasa
 * de un modelo gratuito —que se resuelve esperando o cambiando de modelo—, y
 * el resto es del otro lado.
 *
 * @example
 * throw new AiRequestError(429);
 */
export class AiRequestError extends PasteCodeError {
  constructor(status: number, detail?: string) {
    super(
      `OpenRouter request failed with status ${String(status)}${detail === undefined ? '' : `: ${detail}`}`,
      'AI_REQUEST_FAILED',
      userMessageFor(status)
    );
  }
}

/**
 * La respuesta se canceló desde la UI.
 *
 * Es un error y no un `undefined` para que atraviese el mismo camino que
 * cualquier otro final de respuesta: quien escucha `ai:done` no tiene que
 * distinguir "terminó" de "lo cortaron" con un campo aparte.
 *
 * @example
 * throw new AiCancelledError();
 */
export class AiCancelledError extends PasteCodeError {
  constructor() {
    super(
      'The AI response was cancelled by the user',
      'AI_CANCELLED',
      'Se canceló la respuesta.'
    );
  }
}

/**
 * El modelo pidió una herramienta con argumentos que no validan.
 *
 * Lo que devuelve un modelo es **entrada no confiable**, igual que lo que
 * manda el renderer: puede alucinar un nombre de herramienta, omitir un
 * argumento obligatorio o mandar un número donde va una ruta. Que sea un error
 * con código propio es lo que permite devolvérselo al modelo como resultado de
 * la herramienta —"esto no validó, probá de nuevo"— en vez de cortar la
 * conversación.
 *
 * @example
 * throw new InvalidToolCallError('read_file', 'falta "path"');
 */
export class InvalidToolCallError extends PasteCodeError {
  constructor(tool: string, detail: string) {
    super(
      `Invalid arguments for tool "${tool}": ${detail}`,
      'AI_INVALID_TOOL_CALL',
      `El asistente pidió "${tool}" con argumentos que no se entienden. Se lo informé y va a reintentar.`
    );
  }
}

/** Qué mostrarle a la persona según el código HTTP que volvió. */
function userMessageFor(status: number): string {
  if (status === 401 || status === 403) {
    return 'OpenRouter rechazó la clave. Revisá que esté bien copiada y que siga activa.';
  }

  if (status === 429) {
    return 'El modelo gratuito llegó a su límite de uso por ahora. Esperá un rato o elegí otro modelo.';
  }

  return 'No se pudo hablar con OpenRouter. Revisá tu conexión e intentá de nuevo.';
}
