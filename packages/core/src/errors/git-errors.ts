import { PasteCodeError } from './pastecode-error.js';

/**
 * No hay `git` que ejecutar.
 *
 * No es un error catastrófico: sin git la aplicación funciona igual, sólo que
 * el icono del rail y el indicador de rama no se dibujan. Existe como error
 * porque las operaciones que sí lo necesitan —preparar, commitear— tienen que
 * poder decir por qué no hicieron nada.
 */
export class GitUnavailableError extends PasteCodeError {
  constructor(detail: string) {
    super(`git unavailable: ${detail}`, 'GIT_UNAVAILABLE', detail);
  }
}

/**
 * `git` corrió y terminó mal.
 *
 * **El `stderr` de git sí se le muestra a la persona**, al revés que en el
 * resto del proyecto y por la misma razón que con ripgrep: los mensajes de git
 * están escritos para quien usa git —"nothing to commit", "pathspec did not
 * match"— y son exactamente lo que hace falta para saber qué pasó. No son
 * stacks ni rutas del disco.
 */
export class GitCommandError extends PasteCodeError {
  constructor(command: string, stderr: string, cause?: unknown) {
    const detail = stderr.trim().split('\n')[0] ?? '';

    super(
      `git ${command} failed: ${stderr}`,
      'GIT_COMMAND_FAILED',
      detail === '' ? `El comando de git falló: ${command}.` : detail,
      { cause }
    );
  }
}
