import type { ReadOnlyToolName, SearchMatch, WriteToolName } from '@pastecode/core';
import { applyExactEdit, InvalidToolCallError, parseToolArguments } from '@pastecode/core';

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
 * Lo que el evento `ai:toolCall` necesita para que el renderer escriba.
 *
 * Las tres herramientas de escritura se resuelven a **esta misma forma**, y
 * eso es lo que hace que agregar `apply_edit` no toque ni el evento, ni la
 * tarjeta de diff, ni el checkpoint, ni el camino de escritura.
 */
export interface WriteProposal {
  /** Ruta absoluta, ya validada contra el workspace. */
  path: string;
  /** El contenido final que va a quedar en el archivo. */
  nextContent: string;
  /** Lo que hay hoy, o `null` si el archivo no existe. */
  previousContent: string | null;
}

/**
 * Resuelve una escritura del modelo contra el disco, sin escribir nada.
 *
 * Es lo que el evento `ai:toolCall` necesita: la ruta **ya validada** y el
 * contenido anterior, o `null` si el archivo no existe. Que la validación pase
 * por acá y no por el renderer es lo que hace que una escritura del asistente
 * no pueda salirse del workspace ni aunque el modelo lo pida — y eso vale
 * igual con `autoApply`, porque la frontera de seguridad **no se movió**: lo
 * que cambió con [ADR-0032](../../../../../docs/adr/0032-modos-del-asistente-y-edicion-directa.md)
 * es quién aprieta el botón, no quién resuelve la ruta.
 *
 * `apply_edit` se resuelve acá contra el contenido actual y sale con la misma
 * forma que las otras dos. Un fragmento que no aparece —o que aparece dos
 * veces sin `replaceAll`— es un `InvalidToolCallError`, que `executeCall`
 * convierte en texto para que el modelo reintente con más contexto.
 *
 * @param tool Cuál de las tres, ya verificada como de escritura.
 * @param rawArguments El JSON de argumentos, tal como vino del modelo.
 * @returns Ruta absoluta validada, contenido propuesto y contenido actual.
 * @throws {InvalidToolCallError} Si los argumentos no validan o el fragmento no se puede aplicar.
 * @throws {PathOutsideWorkspaceError} Si la ruta escapa del workspace.
 * @example
 * const proposal = await resolveWriteProposal('write_file', '{"path":"a.ts","content":"x"}');
 */
export async function resolveWriteProposal(
  tool: WriteToolName,
  rawArguments: string
): Promise<WriteProposal> {
  if (tool === 'apply_edit') return resolveExactEdit(rawArguments);

  const { path, content } = parseToolArguments(tool, rawArguments);
  const resolved = await resolveInsideWorkspace(path, requireWorkspaceRoot());
  const current = await readTextFile(resolved).catch(() => null);

  return {
    path: resolved,
    nextContent: content,
    previousContent: current?.content ?? null,
  };
}

/** `apply_edit`, resuelto contra lo que el archivo dice ahora mismo. */
async function resolveExactEdit(rawArguments: string): Promise<WriteProposal> {
  const { path, oldText, newText, replaceAll } = parseToolArguments('apply_edit', rawArguments);
  const resolved = await resolveInsideWorkspace(path, requireWorkspaceRoot());
  const current = await readTextFile(resolved).catch(() => null);

  if (current === null) {
    throw new InvalidToolCallError(
      'apply_edit',
      `el archivo ${path} no existe o no es de texto; para uno nuevo usá create_file`
    );
  }

  const edited = applyExactEdit(current.content, { oldText, newText, replaceAll });

  if (!edited.ok) throw new InvalidToolCallError('apply_edit', describeFailure(edited.reason));

  return { path: resolved, nextContent: edited.content, previousContent: current.content };
}

/** Por qué no se pudo aplicar el fragmento, en algo que el modelo pueda usar. */
function describeFailure(reason: 'not-found' | 'ambiguous'): string {
  // El destinatario es el modelo, así que cada mensaje termina en qué hacer
  // distinto la próxima vez. "No se pudo" a secas produce el mismo reintento.
  return reason === 'not-found'
    ? 'el "oldText" no aparece en el archivo tal cual lo mandaste; volvé a leerlo y copiá el fragmento exacto, con sus espacios y saltos de línea'
    : 'el "oldText" aparece más de una vez; agregá contexto alrededor para que sea único, o mandá replaceAll en true si de verdad querés cambiarlas todas';
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
