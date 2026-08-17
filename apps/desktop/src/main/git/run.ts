import { spawn } from 'node:child_process';

import { GitCommandError } from '@pastecode/core';

import { sanitizedEnvironment } from '../services/shell.js';

/**
 * Cuánto puede tardar un comando antes de darlo por colgado.
 *
 * Son 30 segundos y no 5 por los **hooks**: un `pre-commit` que corre lint y
 * tests tarda lo que tarda, y matarlo a los cinco segundos dejaría el índice a
 * medio commitear. Es el único comando que realmente puede tardar; el resto
 * termina en milisegundos y nunca se acerca al techo.
 */
const TIMEOUT_MS = 30_000;

/** Lo que hace falta para correr un comando de git. */
export interface GitInvocation {
  /** Ruta absoluta al ejecutable, ya verificada. */
  readonly executable: string;
  /** Directorio de trabajo. Siempre la raíz del workspace. */
  readonly cwd: string;
  readonly args: readonly string[];
}

/**
 * Corre un comando de git y devuelve su salida estándar.
 *
 * `shell: false` y argumentos como array, siempre: un array llega al sistema
 * operativo como `argv` sin pasar por ningún intérprete, así que un mensaje de
 * commit con comillas o `&&` es un mensaje. Ver
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md#argumentos-como-array-nunca-como-línea-de-comando).
 *
 * El entorno va saneado por lo mismo que el de la terminal: `ELECTRON_RUN_AS_NODE`
 * heredado hace que cualquier Electron que un hook lance arranque como Node.
 *
 * @param invocation Ejecutable, directorio y argumentos.
 * @returns La salida estándar, tal cual.
 * @throws {GitCommandError} Si git sale con un código distinto de cero, si no
 * se lo puede lanzar o si se agota el tiempo.
 * @example
 * await runGit({ executable, cwd: root, args: ['status', '--porcelain=v2'] });
 */
export async function runGit(invocation: GitInvocation): Promise<string> {
  const { executable, cwd, args } = invocation;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      env: sanitizedEnvironment(process.env),
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new GitCommandError(args[0] ?? '', 'el comando tardó demasiado y se canceló'));
    }, TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (cause) => {
      clearTimeout(timer);
      reject(new GitCommandError(args[0] ?? '', 'no se pudo ejecutar git', cause));
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (code === 0) resolve(stdout);
      else reject(new GitCommandError(args[0] ?? '', stderr));
    });
  });
}
