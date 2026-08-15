import { PasteCodeError } from './pastecode-error.js';

/**
 * El sistema operativo negó una operación sobre un archivo.
 *
 * Envuelve al `errno` de Node en vez de dejarlo llegar crudo a la UI: un
 * `EBUSY` o un `EPERM` no le dicen nada a quien está usando el IDE. El error
 * original queda en `cause` para el log.
 *
 * @example
 * throw new FileAccessError('C:\\proyecto\\src\\index.ts', cause);
 */
export class FileAccessError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `File access denied: ${path}`,
      'FILE_ACCESS_DENIED',
      `No se pudo acceder a "${path}". Verificá que exista y que tengas permisos, y que no esté abierto en otro programa.`,
      { cause }
    );
  }
}

/**
 * El archivo supera el techo que el editor puede abrir.
 *
 * El límite no es arbitrario: [RNF-03](../../../../docs/04-requerimientos-no-funcionales.md)
 * exige que 10MB abra en menos de 2s, y por encima de 50MB Monaco deja de
 * defenderse. Rechazar es mejor que congelar la ventana sin explicación.
 *
 * @example
 * throw new FileTooLargeError('dump.sql', 82_000_000, 52_428_800);
 */
export class FileTooLargeError extends PasteCodeError {
  constructor(path: string, sizeBytes: number, limitBytes: number, cause?: unknown) {
    super(
      `File exceeds the size limit: ${path} (${String(sizeBytes)} bytes, limit ${String(limitBytes)})`,
      'FILE_TOO_LARGE',
      `El archivo pesa ${formatMegabytes(sizeBytes)} y el máximo que PasteCode puede abrir es ${formatMegabytes(limitBytes)}.`,
      { cause }
    );
  }
}

/**
 * El archivo no es texto UTF-8 y esta versión no sabe mostrarlo.
 *
 * Sin este rechazo, hacer click en un `.png` del árbol llena el editor de
 * bytes ilegibles y guardarlo desde ahí corrompe el archivo original.
 *
 * @example
 * throw new BinaryFileUnsupportedError('assets/logo.png');
 */
export class BinaryFileUnsupportedError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `Binary file is not supported: ${path}`,
      'BINARY_FILE_UNSUPPORTED',
      'Ese archivo es binario y todavía no se puede abrir en el editor.',
      { cause }
    );
  }
}

/**
 * El archivo cambió en disco entre la lectura y el intento de guardado.
 *
 * Es la mitad del main de [RF-004](../../../../docs/03-requerimientos-funcionales.md):
 * el handler detecta el conflicto comparando `mtimeMs` y se niega a escribir.
 * Qué hacer al respecto —sobrescribir o descartar— lo decide la persona, no
 * el servicio.
 *
 * @example
 * throw new StaleFileError('src/index.ts', 1_700_000_000_000, 1_700_000_009_999);
 */
export class StaleFileError extends PasteCodeError {
  constructor(path: string, expectedMtimeMs: number, actualMtimeMs: number, cause?: unknown) {
    super(
      `File changed on disk: ${path} (expected mtime ${String(expectedMtimeMs)}, found ${String(actualMtimeMs)})`,
      'STALE_FILE',
      `"${path}" cambió en el disco desde que lo abriste. Elegí si querés sobrescribirlo o descartar tus cambios.`,
      { cause }
    );
  }
}

/** Un decimal alcanza: el mensaje es para orientar, no para auditar bytes. */
function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
