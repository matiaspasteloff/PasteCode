import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { BackupFile } from '@pastecode/core';
import { BackupFileSchema } from '@pastecode/core';

import { writeTextFileAtomically } from './file-system.js';

/**
 * Un backup listo para ofrecer.
 *
 * Es la misma forma que `BackupFile`: lo que está en disco es exactamente lo
 * que se ofrece. El alias existe para nombrar la intención en las firmas.
 */
export type RecoverableBackup = BackupFile;

/** Dónde viven los respaldos. Se reemplaza en el E2E. */
let directory = defaultDirectory();

/** `~/.pastecode/backups/`. */
function defaultDirectory(): string {
  return join(homedir(), '.pastecode', 'backups');
}

/**
 * Apunta los respaldos a otro directorio.
 *
 * Existe para el E2E por la misma razón que `useSessionDirectory`: una suite
 * que le pisa los backups a quien la corre es peor que no tener suite.
 *
 * @param path Directorio de respaldos.
 * @example
 * useBackupDirectory(join(dataDirectory, 'backups'));
 */
export function useBackupDirectory(path: string): void {
  directory = path;
}

/**
 * El archivo donde va el respaldo de una ruta.
 *
 * El nombre es el `sha256` de la ruta y no la ruta escapada, por las dos
 * razones que ya usa la sesión: una ruta larga de Windows más el directorio se
 * pasa del límite de 260 caracteres, y una ruta lleva adentro el nombre de
 * usuario y la estructura de carpetas de alguien.
 */
function fileFor(path: string): string {
  return join(directory, `${createHash('sha256').update(path).digest('hex')}.json`);
}

/**
 * Guarda el contenido sin guardar de un archivo.
 *
 * Usa la misma escritura atómica que un guardado de verdad (RNF-07). Un backup
 * a medias es peor que ninguno: al reabrir se ofrecería restaurar un archivo
 * truncado, que es exactamente el trabajo que se quería no perder.
 *
 * @param path Ruta absoluta del archivo respaldado.
 * @param content Contenido sin guardar.
 * @returns Cuándo quedó escrito.
 * @example
 * await writeBackup('C:\\p\\a.ts', 'const x = 1;');
 */
export async function writeBackup(path: string, content: string): Promise<number> {
  await mkdir(directory, { recursive: true });

  const savedAt = Date.now();

  await writeTextFileAtomically(
    fileFor(path),
    JSON.stringify({ path, content, savedAt } satisfies BackupFile)
  );

  return savedAt;
}

/**
 * Los respaldos que todavía tiene sentido ofrecer.
 *
 * Se descarta un respaldo cuando el archivo en disco **ya está al día**: si su
 * `mtime` es posterior al respaldo, alguien guardó después de que se escribió y
 * el contenido bueno es el del disco. Ofrecerlo igual sería proponer pisar lo
 * guardado con una versión vieja.
 *
 * Un archivo que ya no existe **sí** se ofrece, y es a propósito: lo que quedó
 * en el respaldo es entonces la única copia que hay.
 *
 * @returns Los respaldos recuperables, con su contenido.
 * @example
 * const pending = await pendingBackups();
 */
export async function pendingBackups(): Promise<RecoverableBackup[]> {
  const names = await readdir(directory).catch(() => []);
  const recoverable: RecoverableBackup[] = [];

  for (const name of names) {
    const backup = await readBackup(join(directory, name));

    if (backup === undefined) continue;

    const current = await stat(backup.path).catch(() => undefined);

    if (current !== undefined && current.mtimeMs >= backup.savedAt) {
      // Ya se guardó después: el respaldo no aporta nada y se limpia solo.
      await rm(join(directory, name), { force: true });
      continue;
    }

    recoverable.push(backup);
  }

  return recoverable;
}

/**
 * Borra respaldos.
 *
 * @param path La ruta respaldada, o `undefined` para borrarlos todos.
 * @example
 * await discardBackups('C:\\p\\a.ts');
 * await discardBackups();
 */
export async function discardBackups(path?: string): Promise<void> {
  if (path !== undefined) {
    await rm(fileFor(path), { force: true });
    return;
  }

  await rm(directory, { recursive: true, force: true });
}

/** Lee un respaldo, o `undefined` si no parsea. Uno roto se ignora, no rompe. */
async function readBackup(file: string): Promise<RecoverableBackup | undefined> {
  const raw = await readFile(file, 'utf8').catch(() => undefined);

  if (raw === undefined) return undefined;

  const parsed = BackupFileSchema.safeParse(safeJson(raw));

  return parsed.success ? parsed.data : undefined;
}

/** `JSON.parse` que devuelve `undefined` en vez de lanzar. */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
