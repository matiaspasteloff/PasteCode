import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { EncryptionUnavailableError } from '@pastecode/core';
import { app, safeStorage } from 'electron';

import { writeTextFileAtomically } from '../services/file-system.js';

/**
 * El archivo donde vive la clave, cifrada.
 *
 * En `userData` y no en `~/.pastecode/` como las settings: esto no es
 * configuración que alguien vaya a editar a mano, es un blob binario que sólo
 * el sistema operativo sabe abrir. Ponerlo al lado del `settings.json`
 * invitaría a abrirlo.
 */
const FILE_NAME = 'ai-credentials.bin';

/**
 * La clave en memoria, para no descifrar en cada request.
 *
 * `null` es "no hay"; `undefined` es "todavía no se leyó el disco". Son
 * distintos: sin la diferencia, cada llamada con la clave borrada volvería a
 * leer un archivo que no existe.
 */
let cached: string | null | undefined;

/** Dónde vive el archivo. Se resuelve tarde: `app` no está listo al importar. */
function credentialsPath(): string {
  return join(app.getPath('userData'), FILE_NAME);
}

/**
 * Si este sistema puede guardar la clave cifrada.
 *
 * `safeStorage.isEncryptionAvailable()` da falso en sesiones de Linux sin
 * keyring. **No hay fallback a texto plano**: una clave en un archivo legible
 * es peor que no poder guardarla, porque quien la guarda cree que está
 * protegida ([RF-1003](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)).
 *
 * @returns Si `saveApiKey` puede persistir.
 * @example
 * if (!canPersistApiKey()) avisarQueNoSeVaAGuardar();
 */
export function canPersistApiKey(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Guarda la clave, cifrada con el almacenamiento del sistema operativo.
 *
 * @param apiKey La clave de OpenRouter.
 * @throws {EncryptionUnavailableError} Si el sistema no ofrece cifrado.
 * @example
 * await saveApiKey('sk-or-v1-...');
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  if (!canPersistApiKey()) throw new EncryptionUnavailableError();

  // Base64 y no el Buffer crudo: `writeTextFileAtomically` escribe UTF-8, y
  // meter bytes arbitrarios por un camino de texto los corrompe en silencio.
  // Reusar la escritura atómica de RNF-07 es lo que evita que un corte de luz
  // deje media clave cifrada, que al descifrar da un error sin explicación.
  const encrypted = safeStorage.encryptString(apiKey).toString('base64');

  await writeTextFileAtomically(credentialsPath(), encrypted);
  cached = apiKey;
}

/**
 * La clave guardada, o `null` si no hay ninguna.
 *
 * **No cruza el IPC.** Es lo que usa `openrouter.ts` para armar el header, y
 * el único canal que pregunta por ella devuelve un booleano; ver
 * `AiKeyStatusResponseSchema`.
 *
 * @returns La clave, o `null`.
 * @example
 * const key = await loadApiKey();
 */
export async function loadApiKey(): Promise<string | null> {
  if (cached !== undefined) return cached;

  cached = await readAndDecrypt();

  return cached;
}

/**
 * Borra la clave del disco y de la memoria.
 *
 * @example
 * await clearApiKey();
 */
export async function clearApiKey(): Promise<void> {
  cached = null;

  await rm(credentialsPath(), { force: true });
}

/**
 * Lee el archivo y lo descifra.
 *
 * Cualquier fallo da `null` y no una excepción: el caso normal es que el
 * archivo no exista, y el caso raro —un blob que ya no descifra porque
 * cambiaron las credenciales del sistema— tiene la misma respuesta útil, que
 * es pedir la clave de nuevo.
 */
async function readAndDecrypt(): Promise<string | null> {
  if (!canPersistApiKey()) return null;

  const stored = await readFile(credentialsPath(), 'utf8').catch(() => null);

  if (stored === null || stored === '') return null;

  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch (cause) {
    console.error('[ai] no se pudo descifrar la clave guardada:', cause);
    return null;
  }
}
