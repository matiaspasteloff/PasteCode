import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PasteCodeError } from '@pastecode/core';
import { describe, expect, it } from 'vitest';

import { runGit } from './run.js';

/**
 * El "git" de estos tests es Node corriendo un script de una línea.
 *
 * No hace falta un git de verdad —lo que se verifica acá es el envoltorio del
 * proceso: que capture el stdout, que traduzca un código distinto de cero a un
 * error con el `stderr` adentro, y que los argumentos lleguen como `argv` sin
 * pasar por un intérprete—. Un git real haría los mismos tests dependientes de
 * qué versión tenga instalada quien corre la suite.
 */
const EXECUTABLE = process.execPath;

/** Corre un script de una línea con los argumentos que pida el test. */
function run(script: string, ...extra: string[]): Promise<string> {
  return runGit({ executable: EXECUTABLE, cwd: tmpdir(), args: ['-e', script, ...extra] });
}

describe('runGit', () => {
  it('devuelve la salida estándar', async () => {
    await expect(run('process.stdout.write("hola")')).resolves.toBe('hola');
  });

  it('traduce un código distinto de cero a un error con el stderr adentro', async () => {
    const failing = run('process.stderr.write("pathspec no coincide"); process.exit(1)');

    await expect(failing).rejects.toBeInstanceOf(PasteCodeError);
    await expect(failing).rejects.toMatchObject({
      code: 'GIT_COMMAND_FAILED',
      // El stderr de git **sí** se le muestra a la persona: sus mensajes están
      // escritos para quien usa git y son lo que hace falta para saber qué pasó.
      userMessage: 'pathspec no coincide',
    });
  });

  it('da un mensaje genérico cuando git falla sin decir nada', async () => {
    const failing = await run('process.exit(2)').catch((cause: unknown) => cause);

    expect(failing).toBeInstanceOf(PasteCodeError);
    expect(failing instanceof PasteCodeError && failing.userMessage).toContain('falló');
  });

  it('falla con un error tipado si el ejecutable no existe', async () => {
    const failing = runGit({
      executable: join(tmpdir(), 'no-existe-pastecode'),
      cwd: tmpdir(),
      args: ['status'],
    });

    await expect(failing).rejects.toMatchObject({ code: 'GIT_COMMAND_FAILED' });
  });

  it('pasa los argumentos como argv, sin que los interprete un shell', async () => {
    // Con `shell: true` esto sería dos comandos encadenados; como array es un
    // argumento con `&&` adentro y nada más.
    await expect(
      run('process.stdout.write(process.argv[1] ?? "")', 'uno && rm -rf /')
    ).resolves.toBe('uno && rm -rf /');
  });

  it('corre en el directorio que se le pide', async () => {
    await expect(run('process.stdout.write(process.cwd())')).resolves.toContain(
      tmpdir().slice(0, 6)
    );
  });
});
