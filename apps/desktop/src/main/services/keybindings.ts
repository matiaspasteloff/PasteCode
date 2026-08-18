import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { Keybinding, KeybindingConflict } from '@pastecode/core';
import {
  findConflicts,
  KeybindingsFileSchema,
  PasteCodeError,
  userKeybindings,
} from '@pastecode/core';

/**
 * Cuánto se espera antes de releer. Mismo motivo que en `settings.ts`: un
 * guardado no es un evento sino una ráfaga.
 */
const RELOAD_DEBOUNCE_MS = 150;

/** El error que ve alguien cuyo `keybindings.json` no parsea. */
class InvalidKeybindingsFileError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `Invalid keybindings file: ${path}`,
      'INVALID_KEYBINDINGS_FILE',
      `El archivo "${path}" tiene un error y no se pudo leer. PasteCode sigue con los atajos de fábrica; corregilo y se recarga solo.`,
      { cause }
    );
  }
}

/** Lo que el servicio tiene para contar en cada momento. */
export interface KeybindingsState {
  /** Los atajos del usuario, con las teclas ya normalizadas. */
  bindings: Keybinding[];
  /** Los que se pisan entre sí dentro del archivo del usuario (RF-702). */
  conflicts: KeybindingConflict[];
  /**
   * El error del archivo, o `undefined`.
   *
   * Se declara como `PasteCodeError` y no como la clase concreta: quien lo
   * consume sólo necesita `code` y `userMessage`, y exportar la clase para que
   * se pueda nombrar el tipo sería exportar algo que nadie construye afuera.
   */
  error: PasteCodeError | undefined;
}

/** Estado del servicio. Vive en el main porque el disco vive en el main. */
let bindings: Keybinding[] = [];
let conflicts: KeybindingConflict[] = [];
let lastError: PasteCodeError | undefined;
let path = defaultPath();
let watchers: FSWatcher[] = [];
let pending: NodeJS.Timeout | undefined;
let notify: ((state: KeybindingsState) => void) | undefined;

/** `~/.pastecode/keybindings.json`. */
function defaultPath(): string {
  return join(homedir(), '.pastecode', 'keybindings.json');
}

/**
 * Arranca el servicio: lee el archivo y queda observándolo.
 *
 * @param options `onChange` recibe el estado nuevo en cada recarga.
 * @returns El estado inicial.
 * @example
 * await initializeKeybindings({ onChange: broadcast });
 */
export async function initializeKeybindings(options: {
  onChange: (state: KeybindingsState) => void;
  /** Sólo para tests: reemplaza `~/.pastecode/keybindings.json`. */
  userPath?: string;
}): Promise<KeybindingsState> {
  notify = options.onChange;
  path = options.userPath ?? defaultPath();

  // Mismo criterio que `settings.ts`: `~/.pastecode/` es nuestro y se crea acá,
  // o en una instalación nueva no hay directorio que observar y la recarga en
  // caliente no funciona hasta que alguien lo cree a mano.
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);

  await reload();
  watchFile();

  return currentKeybindings();
}

/**
 * El estado actual.
 *
 * Nunca falla: si el último `reload` no pudo leer el archivo, devuelve la
 * última lista buena. Un JSON roto no deja la app sin teclado (RNF-25).
 *
 * @returns Atajos, conflictos y el último error.
 * @example
 * const { conflicts } = currentKeybindings();
 */
export function currentKeybindings(): KeybindingsState {
  return { bindings, conflicts, error: lastError };
}

/**
 * Corta el watcher y suelta el estado. La llama el cierre de la app.
 *
 * Suelta también los atajos y el error, y no sólo el watcher: el estado vive a
 * nivel de módulo, así que sin esto un segundo `initializeKeybindings` en el
 * mismo proceso —que es lo que hace cada test— arrancaría viendo lo que dejó el
 * anterior.
 */
export function disposeKeybindings(): void {
  closeWatchers();

  bindings = [];
  conflicts = [];
  lastError = undefined;
}

/**
 * Cierra los watchers y cancela la relectura pendiente, sin tocar el estado.
 *
 * Está separado de `disposeKeybindings` porque `watchFile` lo llama para
 * rearmarse, y ahí soltar los atajos recién leídos borraría justo lo que
 * `reload` acaba de cargar.
 */
function closeWatchers(): void {
  for (const watcher of watchers) watcher.close();
  watchers = [];

  if (pending !== undefined) clearTimeout(pending);
  pending = undefined;
}

/**
 * Relee el archivo y recalcula los conflictos.
 *
 * Un archivo ausente **no es un error**: es el caso normal de una instalación
 * nueva, y significa "ningún atajo propio". Sólo un archivo que existe y no
 * parsea produce error.
 */
async function reload(): Promise<void> {
  const raw = await readFile(path, 'utf8').catch(() => undefined);

  if (raw === undefined) {
    bindings = [];
    conflicts = [];
    lastError = undefined;
    return;
  }

  const parsed = parse(raw);

  if (parsed === undefined) {
    // Se conserva la última lista buena, como hace `settings.ts`. Dejar a
    // alguien sin sus atajos por una coma de más es peor que seguir con los
    // de recién.
    lastError = new InvalidKeybindingsFileError(path);
    return;
  }

  bindings = parsed;
  lastError = undefined;
  // **Sólo sobre el archivo del usuario**, y no contra los de fábrica. Un atajo
  // que pisa a uno de fábrica tiene la misma tecla y la misma condición, así
  // que entraría como conflicto —y es justo para lo que existe el archivo: el
  // resolver ya está hecho para que gane el último—. Reportarlo sería marcarle
  // un error a alguien que hizo exactamente lo que quería. Lo que sí es un
  // conflicto, y lo único sobre lo que puede actuar, son dos líneas suyas con
  // la misma tecla y la misma condición.
  conflicts = findConflicts(parsed);
}

/** Los atajos del archivo, o `undefined` si no parsea. */
function parse(raw: string): Keybinding[] | undefined {
  try {
    return userKeybindings(KeybindingsFileSchema.parse(JSON.parse(raw)));
  } catch {
    return undefined;
  }
}

/**
 * Observa el archivo.
 *
 * Observa el **directorio**, no el archivo, por la misma razón que
 * `settings.ts`: una escritura atómica reemplaza el archivo con `rename` y un
 * watcher sobre el inodo viejo se queda mirando algo que nadie va a tocar.
 */
function watchFile(): void {
  closeWatchers();

  const directory = dirname(path);

  try {
    watchers.push(
      watch(directory, (_event, filename) => {
        if (filename !== null && filename !== basename(path)) return;

        scheduleReload();
      })
    );
  } catch {
    // El directorio no existe y no se pudo crear. Sin recarga en caliente, pero
    // la app arranca igual con los atajos de fábrica.
  }
}

/** Agenda una relectura, colapsando la ráfaga de eventos de un guardado. */
function scheduleReload(): void {
  if (pending !== undefined) clearTimeout(pending);

  pending = setTimeout(() => {
    pending = undefined;

    void reload().then(() => {
      notify?.(currentKeybindings());
    });
  }, RELOAD_DEBOUNCE_MS);
}
