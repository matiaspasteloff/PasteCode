import { z } from 'zod';

/**
 * Versión del formato del archivo de settings.
 *
 * [git.md](../../../../docs/convenciones/git.md#versionado) declara al formato
 * de settings como contrato público: un cambio incompatible es un MAJOR. Ese
 * compromiso no se puede cumplir sin saber qué versión escribió el archivo que
 * se está leyendo, y agregar el campo el día que haga falta significa que
 * todos los archivos escritos hasta entonces no lo tienen.
 */
export const SETTINGS_VERSION = 1;

/**
 * Los campos de cada grupo, **sin valores por defecto**.
 *
 * Los defaults viven en `DEFAULT_SETTINGS`, que es una constante y no
 * `.default()` en cada campo. La razón es concreta: la precedencia de
 * [RF-705](../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración)
 * necesita los defaults como **una capa más** del merge, y una capa tiene que
 * ser un objeto que se pueda pasar por parámetro, no un comportamiento
 * escondido adentro de un parser.
 *
 * Con `.default()` por campo además pasaba algo peor, que es el bug que este
 * archivo corrige respecto del schema documentado en
 * [05-modelo-de-datos.md](../../../../docs/05-modelo-de-datos.md#schema-de-settings):
 * los grupos no lo tenían, así que `SettingsSchema.parse({})` fallaba y **un
 * archivo parcial —que es el caso normal— no se podía leer**.
 */
const editorFields = {
  fontSize: z.int().min(6).max(72),
  fontFamily: z.string().min(1),
  tabSize: z.int().min(1).max(16),
  insertSpaces: z.boolean(),
  wordWrap: z.enum(['off', 'on', 'bounded']),
  minimap: z.boolean(),
  formatOnSave: z.boolean(),
  renderWhitespace: z.enum(['none', 'boundary', 'all']),
};

const filesFields = {
  autoSave: z.enum(['off', 'afterDelay', 'onFocusChange']),
  autoSaveDelay: z.int().min(100),
  exclude: z.array(z.string().min(1)),
  trimTrailingWhitespace: z.boolean(),
};

const terminalFields = {
  /** `null` es "el shell por defecto del sistema operativo". */
  shell: z.string().min(1).nullable(),
  fontSize: z.int().min(6).max(72),
};

/**
 * Los servidores de lenguaje.
 *
 * `serverPaths` es un mapa de `serverId` a ruta absoluta, con `null` para "usá
 * el que viene empaquetado o el del PATH resuelto al arrancar". Es un
 * `Record` y no un campo por lenguaje porque la tabla de lenguajes crece con
 * datos y no con código: agregar Python no puede obligar a tocar el schema.
 */
const lspFields = {
  enabled: z.boolean(),
  serverPaths: z.record(z.string().min(1), z.string().min(1).nullable()),
  /**
   * Cuánto se espera una respuesta antes de declarar enfermo al servidor.
   *
   * Es el umbral del health check pasivo de `SupervisedProcess`: la request más
   * vieja sin responder que lo supere manda al proceso al camino del reinicio.
   */
  requestTimeoutMs: z.int().min(1000).max(120_000),
  maxDiagnosticsPerFile: z.int().min(1).max(10_000),
  /** Minutos de inactividad antes de apagar un servidor. Mitiga RNF-04. */
  idleShutdownMinutes: z.int().min(0).max(600),
};

const gitFields = {
  enabled: z.boolean(),
  /** `null` es "resolvelo al arrancar". Nunca se re-resuelve. */
  path: z.string().min(1).nullable(),
  decorationsEnabled: z.boolean(),
  /**
   * Red de seguridad para filesystems donde el watcher miente.
   *
   * `0` es "nunca": el refresco normal lo dispara el watcher, y un sondeo
   * periódico contra un repositorio grande es trabajo constante para nada. Se
   * sube sólo si el watcher no llega, que pasa en algunos montajes de red.
   */
  refreshIntervalMs: z.int().min(0).max(600_000),
};

const windowFields = {
  theme: z.enum(['light', 'dark', 'system']),
  /**
   * El `id` de un tema aportado por una extensión, o vacío para no usar ninguno
   * ([RF-906](../../../../docs/03-requerimientos-funcionales.md)).
   *
   * Va aparte de `theme` y no como un valor más de su enum porque son dos
   * preguntas distintas: `theme` decide claro contra oscuro —y sigue mandando
   * cuando el tema elegido no está instalado—, y esto elige qué paleta se pinta
   * encima. Meterlos en un solo campo obligaría a migrar el archivo de settings
   * de todos los que ya lo tienen escrito.
   *
   * Un id que no corresponde a ningún tema instalado se ignora: una extensión
   * desinstalada no puede dejar al IDE sin colores.
   */
  colorTheme: z.string(),
  zoomLevel: z.number().min(-5).max(5),
};

/**
 * Las settings ya resueltas: todos los campos presentes, todos válidos.
 *
 * Es lo que ve el resto de la aplicación. Nadie aguas abajo tiene que
 * preguntarse si `editor.fontSize` existe.
 */
export const SettingsSchema = z.strictObject({
  editor: z.strictObject(editorFields),
  files: z.strictObject(filesFields),
  git: z.strictObject(gitFields),
  lsp: z.strictObject(lspFields),
  terminal: z.strictObject(terminalFields),
  window: z.strictObject(windowFields),
});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Lo que se lee de un archivo del disco.
 *
 * **Todo es opcional**, hasta los grupos: un `settings.json` con una sola
 * clave es un archivo perfectamente válido y es lo que la gente escribe. Lo
 * que sí es estricto es el resto —una clave desconocida o un tipo equivocado
 * se rechazan—, porque `"fontsize": 14` en minúscula tiene que dar un error
 * visible y no ignorarse en silencio hasta que alguien note que no pasó nada.
 */
export const SettingsFileSchema = z.strictObject({
  version: z.literal(SETTINGS_VERSION).optional(),
  editor: z.strictObject(editorFields).partial().optional(),
  files: z.strictObject(filesFields).partial().optional(),
  git: z.strictObject(gitFields).partial().optional(),
  lsp: z.strictObject(lspFields).partial().optional(),
  terminal: z.strictObject(terminalFields).partial().optional(),
  window: z.strictObject(windowFields).partial().optional(),
});

export type SettingsFile = z.infer<typeof SettingsFileSchema>;

/**
 * La capa de más abajo de la precedencia.
 *
 * Son los mismos valores que documenta
 * [05-modelo-de-datos.md](../../../../docs/05-modelo-de-datos.md#schema-de-settings).
 */
export const DEFAULT_SETTINGS: Settings = {
  editor: {
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'off',
    minimap: true,
    formatOnSave: false,
    renderWhitespace: 'none',
  },
  files: {
    autoSave: 'off',
    autoSaveDelay: 1000,
    exclude: ['**/node_modules', '**/.git', '**/dist'],
    trimTrailingWhitespace: true,
  },
  git: {
    enabled: true,
    path: null,
    decorationsEnabled: true,
    refreshIntervalMs: 0,
  },
  lsp: {
    enabled: true,
    serverPaths: {},
    requestTimeoutMs: 10_000,
    maxDiagnosticsPerFile: 200,
    idleShutdownMinutes: 5,
  },
  terminal: {
    shell: null,
    fontSize: 13,
  },
  window: {
    theme: 'system',
    colorTheme: '',
    zoomLevel: 0,
  },
};
