import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ValidatedManifest } from './manifest.js';
import { ExtensionManifestSchema } from './manifest.js';

/** Una extensión que se encontró y cuyo manifest es válido. */
export interface DiscoveredExtension {
  /** Carpeta raíz. Todo lo que declare el manifest se resuelve contra acá. */
  root: string;
  manifest: ValidatedManifest;
}

/** Una carpeta que parecía una extensión y no cargó. */
export interface ExtensionFailure {
  root: string;
  /** Qué estuvo mal, para el log y para la UI. */
  reason: string;
}

/** Lo que salió de mirar el disco. */
export interface ScanResult {
  extensions: DiscoveredExtension[];
  failures: ExtensionFailure[];
}

/**
 * Busca extensiones en varios directorios.
 *
 * **Un manifest inválido no interrumpe el escaneo**: se anota en `failures` y
 * se sigue. Es [RF-902](../../../docs/03-requerimientos-funcionales.md) al pie
 * de la letra —extensión que no carga, error visible, app viva— y la razón por
 * la que esto devuelve dos listas en vez de lanzar. Una extensión rota de un
 * tercero no puede dejar sin extensiones a las otras cinco.
 *
 * Un directorio que no existe tampoco es un error: `~/.pastecode/extensions/`
 * no existe hasta que alguien instala su primera extensión, y ése es el estado
 * normal de una instalación recién hecha.
 *
 * El orden importa: lo que viene después gana. Se escanea primero
 * `resources/extensions/` y después el del usuario, así que una extensión del
 * usuario con el mismo `name` pisa a la empaquetada, que es lo que permite
 * probar una versión propia sin desinstalar nada.
 *
 * @param directories Dónde mirar, en orden de precedencia creciente.
 * @returns Las que cargaron y las que no.
 * @example
 * const found = await scanExtensions([bundledDir, userDir]);
 */
export async function scanExtensions(directories: readonly string[]): Promise<ScanResult> {
  const result: ScanResult = { extensions: [], failures: [] };
  const byName = new Map<string, DiscoveredExtension>();

  for (const directory of directories) {
    for (const root of await candidateRoots(directory)) {
      const outcome = await readExtension(root);

      if ('reason' in outcome) result.failures.push(outcome);
      else byName.set(outcome.manifest.name, outcome);
    }
  }

  result.extensions = [...byName.values()];

  return result;
}

/** Las subcarpetas de un directorio, o ninguna si no existe. */
async function candidateRoots(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name));
}

/** Lee y valida el manifest de una carpeta. */
async function readExtension(root: string): Promise<DiscoveredExtension | ExtensionFailure> {
  const raw = await readFile(join(root, 'package.json'), 'utf8').catch(() => null);

  if (raw === null) return { root, reason: 'No tiene package.json' };

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return { root, reason: `El package.json no es JSON válido: ${String(cause)}` };
  }

  const validated = ExtensionManifestSchema.safeParse(parsed);

  if (!validated.success) {
    // El mensaje de Zod y no el error entero: lo que viaja hasta la UI tiene
    // que ser texto, y el árbol de issues completo no le dice nada a nadie.
    return {
      root,
      reason: `Manifest inválido: ${validated.error.issues[0]?.message ?? 'desconocido'}`,
    };
  }

  return { root, manifest: validated.data };
}
