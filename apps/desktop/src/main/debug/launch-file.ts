import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LaunchConfiguration } from '@pastecode/core';
import { readLaunchFile } from '@pastecode/core';

/** Lo que hay para debuggear en un workspace, o por qué no hay nada. */
export interface LaunchConfigurations {
  configurations: LaunchConfiguration[];
  /** Qué está mal con el archivo, si está mal. `null` si está bien o no existe. */
  error: { code: string; userMessage: string } | null;
}

/**
 * Lee `<raíz>/.pastecode/launch.json`
 * ([RF-501](../../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Va en `.pastecode/` y no en la raíz porque es donde ya viven las settings de
 * workspace, y porque un repositorio que se clona trae ese directorio entero o
 * ninguno.
 *
 * **Que no exista no es un error.** Es el estado de cualquier repositorio que
 * todavía no configuró debugging, y devolver un error ahí llenaría la UI de
 * ruido para el caso más común. Lo que sí es un error es que exista y esté
 * roto: eso lo escribió alguien y tiene que verlo.
 *
 * El archivo **no elige ningún ejecutable** —eso es `debug.adapterPath`, que el
 * workspace no puede escribir—, así que se lo lee del workspace sin la
 * restricción que tienen las settings. Lo que dice es *qué* depurar, no *con
 * qué*, y esa distinción es la que hace que sea seguro.
 *
 * @param root Raíz del workspace.
 * @returns Las configuraciones, con el error si el archivo está roto.
 * @example
 * const found = await readLaunchConfigurations('C:\\proyecto');
 */
export async function readLaunchConfigurations(root: string): Promise<LaunchConfigurations> {
  const raw = await readFile(join(root, '.pastecode', 'launch.json'), 'utf8').catch(() => null);

  if (raw === null) return { configurations: [], error: null };

  const result = readLaunchFile(raw);

  if ('error' in result) return { configurations: [], error: result.error };

  return { configurations: result.configurations, error: null };
}
