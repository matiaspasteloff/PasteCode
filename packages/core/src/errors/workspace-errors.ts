import { PasteCodeError } from './pastecode-error.js';

/**
 * Una ruta que llegó por IPC no está contenida en el workspace abierto.
 *
 * Es el error que sostiene [RNF-11](../../../../docs/04-requerimientos-no-funcionales.md).
 * El `userMessage` no repite la ruta que se pidió: si el intento vino de una
 * extensión comprometida y no del usuario, mostrarle la ruta atacada en
 * pantalla no lo ayuda a decidir nada y sí le confirma al atacante que el
 * camino existe. La ruta va al `message`, que termina en el log del main.
 *
 * @example
 * throw new PathOutsideWorkspaceError('C:\\Windows\\System32\\config\\SAM');
 */
export class PathOutsideWorkspaceError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `Path escapes the workspace root: ${path}`,
      'PATH_OUTSIDE_WORKSPACE',
      'Esa ruta está fuera de la carpeta abierta. PasteCode sólo puede acceder a archivos del workspace.',
      { cause }
    );
  }
}

/**
 * Se pidió una operación sobre archivos sin tener un workspace abierto.
 *
 * Existe como error propio y no como un `null` que cada handler interpreta:
 * sin workspace no hay raíz contra la cual validar rutas, así que responder
 * cualquier otra cosa que un rechazo explícito sería abrir un agujero.
 *
 * @example
 * if (root === undefined) throw new WorkspaceNotOpenError();
 */
export class WorkspaceNotOpenError extends PasteCodeError {
  constructor(cause?: unknown) {
    super(
      'No workspace is currently open',
      'WORKSPACE_NOT_OPEN',
      'No hay ninguna carpeta abierta. Abrí una carpeta para empezar a trabajar.',
      { cause }
    );
  }
}
