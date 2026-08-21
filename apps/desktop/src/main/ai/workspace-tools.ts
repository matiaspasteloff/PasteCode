import type { ReadOnlyToolName, SearchMatch } from '@pastecode/core';
import { parseToolArguments } from '@pastecode/core';

import { readDirectoryLevel, readTextFile } from '../services/file-system.js';
import { resolveInsideWorkspace } from '../services/path-guard.js';
import { spawnSearch } from '../services/search.js';
import { currentSettings } from '../services/settings.js';
import { requireWorkspaceRoot } from '../services/workspace.js';

/**
 * Cuántas coincidencias se le devuelven al modelo por búsqueda.
 *
 * Mucho más bajo que el techo de la UI —mil— y por una razón distinta: acá el
 * costo no es pintar, es que cada resultado ocupa lugar en la ventana de
 * contexto. Doscientos resultados de búsqueda son la conversación entera.
 */
const MAX_TOOL_MATCHES = 40;

/**
 * Ejecuta una herramienta de **lectura** y devuelve lo que ve el modelo.
 *
 * Las tres pasan por `resolveInsideWorkspace`, sin excepción: una ruta que el
 * modelo se inventó se rechaza exactamente igual que una que se invente el
 * renderer ([RNF-11](../../../../../docs/04-requerimientos-no-funcionales.md)).
 * La diferencia es de dónde puede venir el empujón —el contenido de un archivo
 * del workspace, que lo pudo escribir cualquiera—, no de cuánto se confía.
 *
 * Devuelve texto y no un objeto porque es lo que la API espera como contenido
 * de un mensaje de rol `tool`: el modelo lo lee, no lo deserializa.
 *
 * @param tool Cuál, ya verificada como de sólo lectura.
 * @param rawArguments El JSON de argumentos, tal como vino del modelo.
 * @returns Lo que se le devuelve al modelo.
 * @throws {InvalidToolCallError} Si los argumentos no validan.
 * @throws {PathOutsideWorkspaceError} Si la ruta escapa del workspace.
 * @example
 * await runReadOnlyTool('read_file', '{"path":"src/a.ts"}');
 */
export async function runReadOnlyTool(
  tool: ReadOnlyToolName,
  rawArguments: string
): Promise<string> {
  const root = requireWorkspaceRoot();

  switch (tool) {
    case 'list_files':
      return listFiles(parseToolArguments('list_files', rawArguments).path, root);
    case 'read_file':
      return readFile(parseToolArguments('read_file', rawArguments).path, root);
    case 'search_workspace': {
      const { query, isRegex } = parseToolArguments('search_workspace', rawArguments);

      return searchWorkspace(query, isRegex, root);
    }
  }
}

/**
 * Resuelve la ruta de una propuesta de escritura y lee lo que hay hoy.
 *
 * Es lo que el evento `ai:toolCall` necesita para que el renderer arme el
 * diff: la ruta **ya validada** y el contenido anterior, o `null` si el
 * archivo no existe. Que la validación pase por acá y no por el renderer es lo
 * que hace que "Aplicar" no pueda escribir fuera del workspace ni aunque el
 * modelo lo pida.
 *
 * @param rawArguments El JSON de argumentos de `write_file` o `create_file`.
 * @returns Ruta absoluta validada, contenido propuesto y contenido actual.
 * @throws {InvalidToolCallError} Si los argumentos no validan.
 * @throws {PathOutsideWorkspaceError} Si la ruta escapa del workspace.
 * @example
 * const proposal = await resolveWriteProposal('{"path":"a.ts","content":"x"}');
 */
export async function resolveWriteProposal(
  rawArguments: string
): Promise<{ path: string; nextContent: string; previousContent: string | null }> {
  const { path, content } = parseToolArguments('write_file', rawArguments);
  const resolved = await resolveInsideWorkspace(path, requireWorkspaceRoot());
  const current = await readTextFile(resolved).catch(() => null);

  return {
    path: resolved,
    nextContent: content,
    previousContent: current?.content ?? null,
  };
}

/** Un nivel del árbol, con las mismas exclusiones que ve el explorador. */
async function listFiles(relative: string, root: string): Promise<string> {
  const path = await resolveInsideWorkspace(relative, root);
  const entries = await readDirectoryLevel(path, root, currentSettings().files.exclude);

  if (entries.length === 0) return 'La carpeta está vacía.';

  return entries.map((entry) => (entry.isDirectory ? `${entry.name}/` : entry.name)).join('\n');
}

/** El contenido de un archivo de texto, con sus líneas numeradas. */
async function readFile(relative: string, root: string): Promise<string> {
  const path = await resolveInsideWorkspace(relative, root);
  const { content } = await readTextFile(path);

  // Numeradas porque es lo que hace que el modelo pueda decir "en la línea 42"
  // y que eso signifique algo. Sin los números, cuenta a ojo y se equivoca.
  return content
    .split('\n')
    .map((line, index) => `${String(index + 1)}\t${line}`)
    .join('\n');
}

/**
 * Corre ripgrep con su propio proceso y junta las primeras coincidencias.
 *
 * `spawnSearch` y no `startSearch`: la segunda es de una sola vía —pedir otra
 * consulta descarta la anterior—, y usarla acá cancelaría la búsqueda que la
 * persona tiene abierta en el panel.
 */
async function searchWorkspace(query: string, isRegex: boolean, root: string): Promise<string> {
  const matches = await collectMatches(query, isRegex, root);

  if (matches.length === 0) return `Sin coincidencias para "${query}".`;

  const lines = matches
    .slice(0, MAX_TOOL_MATCHES)
    .map((match) => `${match.path}:${String(match.line)}: ${match.preview.trim()}`);

  if (matches.length > MAX_TOOL_MATCHES) {
    lines.push(`(hay más; se muestran las primeras ${String(MAX_TOOL_MATCHES)})`);
  }

  return lines.join('\n');
}

/** Envuelve el servicio de búsqueda, que es de callbacks, en una promesa. */
async function collectMatches(
  query: string,
  isRegex: boolean,
  root: string
): Promise<SearchMatch[]> {
  return new Promise((resolve, reject) => {
    const found: SearchMatch[] = [];

    const handle = spawnSearch(
      {
        query,
        isRegex,
        isCaseSensitive: false,
        matchWholeWord: false,
        includeGlobs: [],
        excludeGlobs: currentSettings().files.exclude,
      },
      root,
      {
        onResult: (batch) => {
          found.push(...batch);

          // Cortar apenas alcanza: seguir leyendo hasta el techo de mil para
          // quedarse con cuarenta es trabajo tirado, y sobre un repo grande
          // deja al modelo esperando por nada.
          if (found.length >= MAX_TOOL_MATCHES) handle.kill();
        },
        onDone: ({ error }) => {
          // Un error con resultados en mano no es un error: es lo que pasa al
          // matar el proceso por haber juntado suficiente.
          if (error !== null && found.length === 0) reject(error);
          else resolve(found);
        },
      }
    );
  });
}
