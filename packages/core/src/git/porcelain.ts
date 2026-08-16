import type { GitBranchInfo, GitFileChange, GitFileStatus, GitStatus } from './status.js';
import { EMPTY_GIT_STATUS } from './status.js';

/**
 * Parsea la salida de `git status --porcelain=v2 --branch -z`.
 *
 * **Es la mitigación del riesgo "un binario de terceros cambia de formato"**,
 * y por eso vive acá, puro y testeado sin lanzar un proceso. `--porcelain=v2`
 * es formato estable por contrato de git desde 2.11: cambiarlo sería romper a
 * todos los clientes que existen.
 *
 * El `-z` no es cosmético. Sin él, git escapa los nombres no ASCII con comillas
 * y secuencias octales, y cualquier parser tiene que reimplementar esas reglas
 * —incluidas las de `core.quotePath`—. Con `-z` los nombres viajan crudos y el
 * separador es un byte que no puede aparecer en una ruta.
 *
 * @param output La salida entera del comando.
 * @returns La rama y los archivos cambiados.
 * @example
 * parsePorcelainV2('# branch.head main\0'); // rama main, sin cambios
 */
export function parsePorcelainV2(output: string): GitStatus {
  // El último elemento después de un separador final es vacío: se descarta.
  const records = output.split('\0').filter((record) => record !== '');
  const changes: GitFileChange[] = [];
  let branch = EMPTY_GIT_STATUS.branch;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? '';

    if (record.startsWith('# ')) {
      branch = applyBranchHeader(branch, record.slice(2));
      continue;
    }

    // Un renombrado gasta **dos** registros: la entrada y la ruta original. Es
    // la única entrada del formato que lo hace, y leerla mal desalinea todo lo
    // que viene después.
    const consumed = record.startsWith('2 ') ? (records[index + 1] ?? '') : null;

    if (consumed !== null) index += 1;

    const change = parseEntry(record, consumed);

    if (change !== null) changes.push(change);
  }

  return { branch, changes };
}

/** Aplica una línea `# clave valor` de la cabecera. */
function applyBranchHeader(branch: GitBranchInfo, header: string): GitBranchInfo {
  const separator = header.indexOf(' ');
  const key = separator === -1 ? header : header.slice(0, separator);
  const value = separator === -1 ? '' : header.slice(separator + 1);

  if (key === 'branch.head') {
    // git escribe literalmente `(detached)` cuando el HEAD está suelto.
    return { ...branch, name: value === '(detached)' ? null : value };
  }

  if (key === 'branch.upstream') return { ...branch, upstream: value };

  if (key === 'branch.ab') {
    const { ahead, behind } = parseAheadBehind(value);

    return { ...branch, ahead, behind };
  }

  return branch;
}

/**
 * Lee `+1 -2` del campo `branch.ab`.
 *
 * Sale **gratis** de la misma invocación gracias a `--branch`, y es lo que la
 * barra de estado muestra. Calcularlo aparte costaría un `rev-list` por
 * refresco.
 */
function parseAheadBehind(value: string): { ahead: number; behind: number } {
  const match = /^\+(\d+) -(\d+)$/.exec(value);

  if (match === null) return { ahead: 0, behind: 0 };

  return { ahead: Number(match[1]), behind: Number(match[2]) };
}

/** Traduce una entrada de archivo. `null` para lo que no es una. */
function parseEntry(record: string, originalPath: string | null): GitFileChange | null {
  const kind = record[0];

  if (kind === '?') {
    return {
      path: record.slice(2),
      indexStatus: null,
      worktreeStatus: 'untracked',
      originalPath: null,
    };
  }

  // `!` son los ignorados, y sólo aparecen con `--ignored`. No se piden: son
  // decenas de miles de entradas en cualquier repo con `node_modules`.
  if (kind === '!') return null;
  if (kind === 'u') return parseUnmerged(record);
  if (kind === '1' || kind === '2') return parseTracked(record, kind, originalPath);

  return null;
}

/**
 * Una entrada con conflicto.
 *
 * Los dos lados quedan en `conflict` a propósito: un archivo en conflicto no
 * está "modificado en el índice y modificado en el árbol", está en un estado
 * que no se resuelve con stage ni con checkout, y mostrarlo como los otros
 * invita a hacer justo lo que no hay que hacer.
 */
function parseUnmerged(record: string): GitFileChange {
  // `u XY sub m1 m2 m3 mW h1 h2 h3 path` — diez campos antes de la ruta.
  return {
    path: fieldsAfter(record, 10),
    indexStatus: 'conflict',
    worktreeStatus: 'conflict',
    originalPath: null,
  };
}

/** Una entrada normal (`1`) o renombrada (`2`). */
function parseTracked(
  record: string,
  kind: '1' | '2',
  originalPath: string | null
): GitFileChange {
  const codes = record.slice(2, 4);
  // `1 XY sub mH mI mW hH hI path` son 8 campos; el `2` agrega el `X<score>`.
  const path = fieldsAfter(record, kind === '1' ? 8 : 9);

  return {
    path,
    indexStatus: statusOf(codes[0]),
    worktreeStatus: statusOf(codes[1]),
    originalPath: kind === '2' ? originalPath : null,
  };
}

/** Todo lo que viene después de los primeros `count` campos separados por espacio. */
function fieldsAfter(record: string, count: number): string {
  let offset = 0;

  for (let field = 0; field < count; field += 1) {
    const next = record.indexOf(' ', offset);

    if (next === -1) return '';

    offset = next + 1;
  }

  return record.slice(offset);
}

/** Traduce un carácter del código `XY`. */
function statusOf(code: string | undefined): GitFileStatus | null {
  if (code === 'M' || code === 'T') return 'modified';
  if (code === 'A') return 'added';
  if (code === 'D') return 'deleted';
  // Copiado se cuenta como renombrado: la UI dibuja lo mismo y la diferencia
  // sólo importa para quien lee el historial, no para quien mira el panel.
  if (code === 'R' || code === 'C') return 'renamed';
  if (code === 'U') return 'conflict';

  return null;
}

/**
 * La raíz del repositorio que devolvió `git rev-parse --show-toplevel`.
 *
 * git siempre la escribe con `/`, incluso en Windows. Se devuelve tal cual: lo
 * que hace falta comparar contra ella se normaliza del otro lado.
 *
 * @param output La salida del comando.
 * @returns La ruta, o `null` si no había ninguna.
 * @example
 * parseToplevel('C:/proyecto\n'); // 'C:/proyecto'
 */
export function parseToplevel(output: string): string | null {
  const trimmed = output.trim();

  return trimmed === '' ? null : trimmed;
}

/**
 * Las ramas locales de `git branch --format=%(refname:short) --list`.
 *
 * @param output La salida del comando.
 * @returns Los nombres, en el orden en que git los listó.
 * @example
 * parseBranchList('main\nfeature/x\n'); // ['main', 'feature/x']
 */
export function parseBranchList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
