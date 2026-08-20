import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { sep } from 'node:path';

import type { SearchMatch, SearchQuery } from '@pastecode/core';
import { buildRipgrepArgs, PasteCodeError, parseRipgrepLine } from '@pastecode/core';
import { rgPath } from '@vscode/ripgrep';

/**
 * Techo de resultados por búsqueda.
 *
 * No es una decisión de rendimiento del backend sino de la UI: nadie recorre
 * mil resultados, y serializarlos cuesta más que encontrarlos. Al llegar acá
 * se mata el proceso y se avisa `truncated`, que es distinto de "no había más".
 */
const MAX_MATCHES = 1000;

/**
 * Cuánto se acumula antes de mandar un lote.
 *
 * Un evento por match haría un salto de proceso por resultado. Con lotes, el
 * primer render de [RF-201](../../../../../docs/03-requerimientos-funcionales.md#búsqueda-en-workspace)
 * llega igual de rápido —el primer lote sale apenas hay algo— y el resto no
 * satura el bus.
 */
const BATCH_SIZE = 50;

/** Cada cuánto se vacía el lote aunque no esté lleno, en milisegundos. */
const BATCH_INTERVAL_MS = 30;

/** Lo que el servicio le informa a quien lo usa. */
export interface SearchCallbacks {
  onResult: (matches: SearchMatch[]) => void;
  onDone: (outcome: { truncated: boolean; error: PasteCodeError | null }) => void;
}

/** La búsqueda en curso. Sólo hay una: pedir otra cancela la anterior. */
let running: ChildProcessWithoutNullStreams | undefined;

/**
 * La ruta del binario de ripgrep.
 *
 * `rgPath` la resuelve con `require.resolve`, así que en el build empaquetado
 * apunta adentro del `app.asar` — y **un ejecutable adentro de un asar no se
 * puede lanzar**: el sistema operativo necesita un archivo real en el disco.
 * `asarUnpack` lo deja en `app.asar.unpacked`, y esto es lo que traduce la
 * ruta. Es el mismo problema que el `.node` de node-pty, con la misma solución.
 *
 * **Nunca se busca en el `PATH`.** Ver
 * [seguridad.md](../../../../../docs/convenciones/seguridad.md#el-ejecutable-nunca-se-resuelve-por-path).
 *
 * @returns Ruta absoluta a `rg`.
 * @example
 * ripgrepPath(); // '...\\resources\\app.asar.unpacked\\node_modules\\...\\rg.exe'
 */
export function ripgrepPath(): string {
  return rgPath.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}

/**
 * Lanza una búsqueda, cancelando la anterior si había una.
 *
 * Los resultados llegan por `onResult` a medida que ripgrep los escribe, no al
 * final: es lo que hace que RF-201 —los primeros 100 matches en menos de un
 * segundo sobre 50.000 archivos— sea alcanzable. Una respuesta única llega,
 * por definición, cuando la búsqueda terminó.
 *
 * @param search Qué buscar y con qué filtros.
 * @param root Raíz del workspace.
 * @param callbacks Adónde van los resultados.
 * @example
 * startSearch(query, root, { onResult, onDone });
 */
export function startSearch(
  search: SearchQuery,
  root: string,
  callbacks: SearchCallbacks
): void {
  cancelSearch();

  running = spawnSearch(search, root, callbacks).child;
}

/**
 * Lanza una búsqueda **sin tocar la que la UI tenga en curso**.
 *
 * Existe para el asistente de IA, que tiene su propia herramienta de búsqueda
 * ([RF-1005](../../../../../docs/03-requerimientos-funcionales.md#asistente-de-ia-etapa-experimental)).
 * Sin esto, pedirle al asistente que busque algo cancelaría la búsqueda que la
 * persona tiene abierta en el panel, porque `startSearch` es de una sola vía a
 * propósito: en el panel, pedir otra consulta **significa** descartar la
 * anterior.
 *
 * Son dos políticas distintas sobre el mismo mecanismo, así que lo que se
 * comparte es el mecanismo: el binario, los argumentos, el troceado de líneas
 * y el techo de resultados salen todos de acá. Duplicar el servicio para el
 * asistente habría sido tener dos lugares donde arreglar el próximo bug de
 * ripgrep.
 *
 * @param search Qué buscar y con qué filtros.
 * @param root Raíz del workspace.
 * @param callbacks Adónde van los resultados.
 * @returns Un handle para matar este proceso y nada más.
 * @example
 * const handle = spawnSearch(query, root, { onResult, onDone });
 */
export function spawnSearch(
  search: SearchQuery,
  root: string,
  callbacks: SearchCallbacks
): { child: ChildProcessWithoutNullStreams; kill: () => void } {
  const child = spawn(ripgrepPath(), buildRipgrepArgs(search, root), {
    cwd: root,
    // Nunca por shell: el patrón lo escribe una persona —o un modelo— y puede
    // tener cualquier cosa adentro. Ver seguridad.md.
    shell: false,
  });

  drain(child, callbacks);

  return {
    child,
    kill: () => {
      child.kill();
    },
  };
}

/**
 * Corta la búsqueda en curso, si hay alguna.
 *
 * @example
 * cancelSearch();
 */
export function cancelSearch(): void {
  running?.kill();
  running = undefined;
}

/** Lee la salida del proceso, arma los lotes y avisa cuando termina. */
function drain(child: ChildProcessWithoutNullStreams, callbacks: SearchCallbacks): void {
  let buffered = '';
  let batch: SearchMatch[] = [];
  let total = 0;
  let truncated = false;
  let stderr = '';

  const flush = (): void => {
    if (batch.length === 0) return;

    callbacks.onResult(batch);
    batch = [];
  };

  const timer = setInterval(flush, BATCH_INTERVAL_MS);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;

    // El último trozo casi nunca es una línea completa: se lo deja para el
    // chunk siguiente. Sin esto, un JSON partido a la mitad se descarta y el
    // resultado desaparece sin que nada falle.
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';

    for (const line of lines) {
      const match = parseRipgrepLine(line);
      if (match === undefined) continue;

      batch.push(match);
      total += 1;

      if (batch.length >= BATCH_SIZE) flush();

      if (total >= MAX_MATCHES) {
        truncated = true;
        child.kill();
        break;
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  child.on('error', (cause) => {
    clearInterval(timer);

    // Sólo si es **este** proceso el que la UI tenía en curso: desde que
    // `spawnSearch` existe, acá puede morir la búsqueda del asistente, y
    // limpiar el slot compartido dejaría a `cancelSearch` sin a quién matar.
    if (running === child) running = undefined;

    callbacks.onDone({ truncated, error: spawnFailure(cause) });
  });

  child.on('close', (code) => {
    clearInterval(timer);
    flush();

    if (running === child) running = undefined;

    // ripgrep sale con 1 cuando no encontró nada: eso no es un error, es un
    // resultado. Con 2 sí falló —un regex inválido, por ejemplo—.
    const failed = code !== null && code > 1;

    callbacks.onDone({
      truncated,
      error: failed ? searchFailure(stderr) : null,
    });
  });
}

/** El binario no se pudo lanzar. Es un problema de instalación, no de uso. */
function spawnFailure(cause: unknown): PasteCodeError {
  return new PasteCodeError(
    'Failed to spawn ripgrep',
    'SEARCH_UNAVAILABLE',
    'No se pudo iniciar la búsqueda. Puede que la instalación de PasteCode esté incompleta.',
    { cause }
  );
}

/**
 * ripgrep terminó mal.
 *
 * El mensaje de ripgrep **sí** se le muestra a la persona, al revés que en el
 * resto del proyecto: el caso normal es un regex inválido, y ahí lo que dice
 * ripgrep —qué carácter, en qué posición— es exactamente lo que hace falta
 * para arreglarlo. No es un stack trace ni una ruta del disco.
 */
function searchFailure(stderr: string): PasteCodeError {
  const detail = stderr.trim().split('\n')[0] ?? '';

  return new PasteCodeError(
    `ripgrep failed: ${stderr}`,
    'SEARCH_FAILED',
    detail === ''
      ? 'La búsqueda falló. Revisá el patrón e intentá de nuevo.'
      : `La búsqueda falló: ${detail}`
  );
}
