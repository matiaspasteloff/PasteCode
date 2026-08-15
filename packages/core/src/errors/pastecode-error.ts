/**
 * Clase base de todo error del proyecto.
 *
 * La razón de existir es la separación entre `message` y `userMessage`: el
 * primero es para el log y el desarrollador, el segundo es lo único que la UI
 * tiene permitido mostrar ([RNF-25](../../../../docs/04-requerimientos-no-funcionales.md)).
 * Sin esta separación en la clase base, la decisión de qué se le muestra al
 * usuario queda repartida en cada `catch` del proyecto, y algún día se filtra
 * un stack trace a la pantalla.
 *
 * @example
 * class FileAccessError extends PasteCodeError {
 *   constructor(path: string, cause?: unknown) {
 *     super(
 *       `File access denied: ${path}`,
 *       'FILE_ACCESS_DENIED',
 *       `No se pudo acceder al archivo. Verificá los permisos de "${path}".`,
 *       { cause }
 *     );
 *   }
 * }
 */
export class PasteCodeError extends Error {
  /**
   * @param message Descripción técnica, en inglés. Va al log, nunca a la UI.
   * @param code Identificador estable en SCREAMING_SNAKE_CASE. Es lo que el
   *   código y los tests comparan; el `message` puede cambiar de redacción sin
   *   romper nada, el `code` no.
   * @param userMessage Mensaje para la persona que usa el IDE: qué pasó y qué
   *   puede hacer al respecto.
   * @param options `cause` preserva el error original de la capa de abajo.
   */
  constructor(
    message: string,
    readonly code: string,
    readonly userMessage: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);

    // `new.target.name` y no un literal: cada subclase reporta su propio
    // nombre sin tener que acordarse de setearlo. Un `name` mal puesto se
    // nota recién cuando estás leyendo el log de un crash en producción.
    this.name = new.target.name;
  }
}
