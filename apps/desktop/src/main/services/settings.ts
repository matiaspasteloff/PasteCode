import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import type { Settings, SettingsFile } from '@pastecode/core';
import {
  PasteCodeError,
  resolveSettings,
  SETTINGS_VERSION,
  SettingsFileSchema,
} from '@pastecode/core';

import { writeTextFileAtomically } from './file-system.js';

/**
 * Cuánto se espera antes de releer un archivo que cambió.
 *
 * Guardar desde un editor no es un evento: es una ráfaga. Un guardado atómico
 * —el nuestro incluido— produce al menos un `rename` y un cambio de tamaño, y
 * hay editores que producen cinco. Sin el debounce, cada guardado dispara
 * varias relecturas y varios `settings:changed`, y el renderer repinta de más.
 */
const RELOAD_DEBOUNCE_MS = 150;

/** Dónde vive cada archivo. `null` cuando no hay workspace abierto. */
interface SettingsPaths {
  user: string;
  workspace: string | null;
}

/** El error que se le muestra a alguien cuyo `settings.json` no parsea. */
export class InvalidSettingsFileError extends PasteCodeError {
  constructor(path: string, cause?: unknown) {
    super(
      `Invalid settings file: ${path}`,
      'INVALID_SETTINGS_FILE',
      `El archivo "${path}" tiene un error y no se pudo leer. PasteCode sigue funcionando con los últimos valores válidos; corregí el archivo y se recarga solo.`,
      { cause }
    );
  }
}

/** Estado del servicio. Vive en el main porque el disco vive en el main. */
let resolved: Settings | undefined;
let userLayer: SettingsFile = {};
let workspaceLayer: SettingsFile = {};
let paths: SettingsPaths = { user: defaultUserPath(), workspace: null };
let watchers: FSWatcher[] = [];
let pending: NodeJS.Timeout | undefined;
let notify: ((settings: Settings) => void) | undefined;
/** Último error de lectura, para que la UI lo pueda mostrar (RNF-25). */
let lastError: InvalidSettingsFileError | undefined;

/** `~/.pastecode/settings.json`. */
function defaultUserPath(): string {
  return join(homedir(), '.pastecode', 'settings.json');
}

/**
 * Arranca el servicio: lee las dos capas y queda observando los archivos.
 *
 * @param options `onChange` recibe las settings resueltas en cada recarga.
 * @example
 * await initializeSettings({ onChange: (settings) => broadcast(settings) });
 */
export async function initializeSettings(options: {
  onChange: (settings: Settings) => void;
  /** Sólo para tests: reemplaza `~/.pastecode/settings.json`. */
  userPath?: string;
}): Promise<Settings> {
  notify = options.onChange;
  paths = { user: options.userPath ?? defaultUserPath(), workspace: paths.workspace };

  // `~/.pastecode/` es nuestro directorio y se crea acá. Sin esto, en una
  // instalación nueva no hay qué observar y la recarga en caliente de RF-704
  // no funciona hasta que la app escriba el archivo por primera vez, que es
  // justo el caso que nadie prueba. La carpeta del workspace **no** se crea:
  // ésa es de otro, y crear directorios adentro de un repo ajeno sin que
  // nadie lo pida no es aceptable.
  await mkdir(dirname(paths.user), { recursive: true }).catch(() => undefined);

  await reload();
  watchFiles();

  return current();
}

/**
 * Cambia el workspace observado. Vuelve a resolver con la capa nueva.
 *
 * @param root Raíz del workspace, o `null` al cerrarlo.
 * @example
 * await setSettingsWorkspace('C:\\proyectos\\PasteCode');
 */
export async function setSettingsWorkspace(root: string | null): Promise<Settings> {
  paths = {
    user: paths.user,
    workspace: root === null ? null : join(root, '.pastecode', 'settings.json'),
  };

  await reload();
  watchFiles();

  return current();
}

/**
 * Las settings efectivas.
 *
 * Nunca falla y nunca devuelve algo a medias: si el último `reload` no pudo
 * leer un archivo, devuelve lo que había antes. Es lo que hace que un JSON
 * roto no tumbe la aplicación (RNF-25).
 *
 * @returns Las settings resueltas.
 * @example
 * const { exclude } = currentSettings().files;
 */
export function currentSettings(): Settings {
  return current();
}

/** El último error de lectura, si el estado actual viene de un archivo roto. */
export function settingsError(): InvalidSettingsFileError | undefined {
  return lastError;
}

/**
 * Escribe una capa, combinándola con lo que el archivo ya tenía.
 *
 * Se combina y no se reemplaza porque el renderer manda sólo lo que cambió: un
 * `settings:update` con `editor.fontSize` no puede borrar el resto del archivo
 * que la persona escribió a mano.
 *
 * @param scope Qué archivo se toca.
 * @param patch Las claves a cambiar.
 * @returns Las settings resueltas después de escribir.
 * @throws {PasteCodeError} Si no hay workspace y el scope es `workspace`.
 * @example
 * await updateSettings('user', { editor: { fontSize: 16 } });
 */
export async function updateSettings(
  scope: 'user' | 'workspace',
  patch: SettingsFile
): Promise<Settings> {
  const path = scope === 'user' ? paths.user : paths.workspace;

  if (path === null) {
    throw new PasteCodeError(
      'Cannot write workspace settings without an open workspace',
      'WORKSPACE_NOT_OPEN',
      'No hay ninguna carpeta abierta, así que no hay dónde guardar la configuración del workspace.'
    );
  }

  const existing = scope === 'user' ? userLayer : workspaceLayer;
  const merged: SettingsFile = {
    ...existing,
    ...patch,
    version: SETTINGS_VERSION,
    editor: { ...existing.editor, ...patch.editor },
    files: { ...existing.files, ...patch.files },
    terminal: { ...existing.terminal, ...patch.terminal },
    window: { ...existing.window, ...patch.window },
  };

  await mkdir(dirname(path), { recursive: true });
  // Reusa la escritura atómica de RNF-07: un settings.json es un archivo del
  // usuario como cualquier otro, y perderlo por un corte a mitad de escritura
  // sería igual de malo que perder código.
  await writeTextFileAtomically(path, `${JSON.stringify(merged, null, 2)}\n`);

  await reload();
  // El directorio puede no haber existido cuando se montaron los watchers.
  // Ahora existe, así que se vuelven a montar sobre algo real.
  watchFiles();

  return current();
}

/** Corta los watchers. La llama el cierre de la app. */
export function disposeSettings(): void {
  for (const watcher of watchers) watcher.close();
  watchers = [];

  if (pending !== undefined) clearTimeout(pending);
  pending = undefined;
}

/** Lo resuelto, o los defaults si todavía no se leyó nada. */
function current(): Settings {
  resolved ??= resolveSettings({}, {});

  return resolved;
}

/**
 * Relee las dos capas y vuelve a resolver.
 *
 * **Una capa que no parsea no pisa a la anterior.** Es la mitad de RNF-25:
 * mientras el archivo esté roto se sigue trabajando con los últimos valores
 * buenos, y en cuanto se arregla el watcher lo detecta y todo vuelve solo.
 */
async function reload(): Promise<void> {
  lastError = undefined;

  const user = await readLayer(paths.user);
  const workspace = paths.workspace === null ? {} : await readLayer(paths.workspace);

  if (user !== undefined) userLayer = user;
  if (workspace !== undefined) workspaceLayer = workspace;
  if (paths.workspace === null) workspaceLayer = {};

  resolved = resolveSettings(userLayer, workspaceLayer);
}

/**
 * Lee y valida una capa.
 *
 * @returns Lo leído, `{}` si el archivo no existe, o `undefined` si está roto
 *   —que es distinto: "no hay archivo" es un estado normal y "el archivo tiene
 *   un error" es algo que hay que contarle a alguien—.
 */
async function readLayer(path: string): Promise<SettingsFile | undefined> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch {
    // No existe todavía. Es el estado de cualquier instalación nueva.
    return {};
  }

  try {
    return SettingsFileSchema.parse(JSON.parse(raw));
  } catch (cause) {
    lastError = new InvalidSettingsFileError(path, cause);
    console.error(`[settings] ${path} no se pudo leer:`, cause);

    return undefined;
  }
}

/**
 * Observa las dos capas.
 *
 * Observa el **directorio** y no el archivo: una escritura atómica reemplaza
 * el archivo por otro con `rename`, y un watcher sobre el inodo viejo se queda
 * mirando algo que ya nadie va a tocar. Es el bug clásico de `fs.watch` sobre
 * archivos que edita cualquier herramienta seria, la nuestra incluida.
 */
function watchFiles(): void {
  disposeSettings();

  for (const path of [paths.user, paths.workspace]) {
    if (path !== null) armWatcher(path);
  }
}

/**
 * Observa un archivo de settings, exista o no todavía.
 *
 * El caso que obliga a las dos ramas es el workspace: `<raíz>/.pastecode/` no
 * existe en la enorme mayoría de los repositorios, y sin la segunda rama
 * alguien que crea ese archivo con la app abierta no vería ningún efecto hasta
 * reiniciar. Se observa el directorio de más arriba hasta que aparezca, y
 * recién ahí se arma el watcher de verdad.
 */
function armWatcher(path: string): void {
  const directory = dirname(path);

  if (tryWatch(directory, basename(path), scheduleReload)) return;

  tryWatch(dirname(directory), basename(directory), () => {
    // Ya apareció: se rearma todo —esto cierra el watcher del padre— y se
    // relee, porque el archivo puede haberse creado con contenido.
    watchFiles();
    scheduleReload();
  });
}

/**
 * Monta un watcher sobre un directorio.
 *
 * Se observa el **directorio** y no el archivo: una escritura atómica —la
 * nuestra incluida (RNF-07)— reemplaza el archivo con `rename`, y un watcher
 * sobre el inodo viejo se queda mirando algo que ya nadie va a tocar. Es el
 * bug clásico de `fs.watch` sobre archivos que edita cualquier herramienta
 * seria.
 *
 * @returns `false` si el directorio no existe.
 */
function tryWatch(directory: string, name: string, onHit: () => void): boolean {
  try {
    const watcher = watch(directory, (_event, filename) => {
      if (filename !== null && filename !== name) return;

      onHit();
    });

    // **Sin este listener, un error del watcher mata el proceso.** `FSWatcher`
    // es un `EventEmitter`, y un evento `'error'` sin nadie escuchando lo
    // relanza como excepción sin atrapar: en el main eso es la ventana, la
    // sesión y las pestañas sin guardar, igual que el abort de libuv que
    // describe `realpath.native` en `workspace.ts`. Y el error llega solo, sin
    // que nadie haga nada: en Windows, borrar, renombrar o desmontar el
    // directorio observado —un `git clean`, cambiar de rama, sacar el pendrive
    // donde vive el proyecto— le entrega `EPERM` a este handle. El de la capa
    // de workspace observa `<raíz>/.pastecode` o, mientras ese directorio no
    // exista, la raíz misma, así que es la carpeta del proyecto la que dispara.
    watcher.on('error', (cause) => {
      console.error(
        JSON.stringify({ scope: 'settings-watcher', event: 'failed', directory }),
        cause
      );
      // El handle ya está muerto: se saca de la lista para que `disposeSettings`
      // no lo cierre dos veces y para no dejarlo contado como vivo. No se
      // rearma acá a propósito —quien borró el directorio observado suele estar
      // por cerrar el workspace, y reintentar sobre algo que no existe sería un
      // ciclo—; el próximo `setSettingsWorkspace` o `updateSettings` remonta
      // todo con `watchFiles`.
      watchers = watchers.filter((candidate) => candidate !== watcher);
      watcher.close();
    });

    watchers.push(watcher);

    return true;
  } catch {
    return false;
  }
}

/** Agenda una relectura, colapsando la ráfaga de eventos de un guardado. */
function scheduleReload(): void {
  if (pending !== undefined) clearTimeout(pending);

  pending = setTimeout(() => {
    pending = undefined;

    void reload().then(() => {
      notify?.(current());
    });
  }, RELOAD_DEBOUNCE_MS);
}
