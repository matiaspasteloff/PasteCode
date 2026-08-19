import { z } from 'zod';

/**
 * En qué estado está el extension host.
 *
 * Es el estado **resuelto** y no el crudo del supervisor: quien lo consume no
 * tiene por qué distinguir "murió y todavía no arranqué el reintento" de
 * "arrancando el reintento". Las dos cosas se ven igual desde afuera —las
 * extensiones no andan y en un rato sí— y darles dos nombres sería obligar a
 * cada consumidor a saber de backoff.
 *
 * `gaveUp` es el único que no se arregla solo: son los tres intentos de
 * [RNF-09](../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)
 * agotados, y a partir de ahí el IDE sigue andando **sin** extensiones, que es
 * lo que [RF-907](../../../../docs/03-requerimientos-funcionales.md) pide.
 */
export const HostStateSchema = z.enum(['starting', 'ready', 'restarting', 'gaveUp']);

/** El estado del host, tal como lo ve el renderer. */
export const ExtensionHostStatusSchema = z.strictObject({
  state: HostStateSchema,
  /**
   * El pid del host vivo, o `null` si no hay ninguno.
   *
   * Viaja porque es lo que hace verificable el reinicio: un pid distinto es la
   * única prueba de que el proceso se relanzó y no de que nunca se cayó.
   */
  pid: z.number().nullable(),
  /** Cuántas veces se reinició desde que arrancó la app. */
  restarts: z.number(),
});

/** Payload de `extensions:getStatus`. Sin parámetros: el host es uno solo. */
export const GetExtensionHostStatusRequestSchema = z.strictObject({});

/** En qué estado quedó una extensión. */
export const ExtensionStateSchema = z.enum(['inactive', 'active', 'failed']);

/**
 * Una extensión, tal como la ve el renderer.
 *
 * Las que fallaron viajan igual, con su `reason`: [RF-902](../../../../docs/03-requerimientos-funcionales.md)
 * pide error **visible**, y una extensión que desaparece de la lista sin decir
 * nada no es visible.
 */
export const ExtensionInfoSchema = z.strictObject({
  name: z.string(),
  displayName: z.string(),
  version: z.string(),
  state: ExtensionStateSchema,
  /**
   * Lo que declaró en su manifest.
   *
   * Viaja hasta el renderer porque es lo que el modelo de amenazas pide que la
   * persona pueda ver: *"capability `network` requerida y declarada en el
   * manifest; el usuario la ve al instalar"*. Y es lo que el main usa para
   * hacerlas cumplir, que es la razón por la que sale del host junto con el
   * resto del reporte en vez de volver a leer los manifests.
   */
  capabilities: z.array(z.enum(['statusBar', 'documentRead', 'documentWrite', 'network'])),
  reason: z.string().optional(),
});

/** Payload de `extensions:list`. Sin parámetros: se piden todas. */
export const ListExtensionsRequestSchema = z.strictObject({});

/** Respuesta de `extensions:list`: lo cargado y lo que aporta. */
export const ListExtensionsResponseSchema = z.strictObject({
  extensions: z.array(ExtensionInfoSchema),
  themes: z.array(z.lazy(() => ExtensionThemeSchema)),
});

/** Un comando que aporta una extensión, ya resuelto. */
export const ExtensionCommandSchema = z.strictObject({
  /** Quién lo aporta. Es lo que permite darlo de baja en bloque. */
  extension: z.string(),
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
});

/** Un ítem de la status bar aportado por una extensión. */
export const ExtensionStatusItemSchema = z.strictObject({
  extension: z.string(),
  itemId: z.string(),
  text: z.string(),
  tooltip: z.string().optional(),
  /** El comando que se ejecuta al hacerle clic. */
  command: z.string().optional(),
  alignment: z.enum(['left', 'right']),
  priority: z.number(),
});

/**
 * Todo lo que las extensiones aportan a la UI, resuelto.
 *
 * Va entero y no como delta, igual que `git:changed`: quien lo recibe no
 * reconstruye nada, y un evento perdido no deja media status bar de una
 * extensión que ya se descargó.
 */
export const ExtensionContributionsSchema = z.strictObject({
  commands: z.array(ExtensionCommandSchema),
  statusItems: z.array(ExtensionStatusItemSchema),
});

/** Payload de `extensions:executeCommand`: correr un comando de una extensión. */
export const ExecuteExtensionCommandRequestSchema = z.strictObject({
  extension: z.string().min(1),
  id: z.string().min(1),
});

/** Respuesta de `extensions:executeCommand`. */
export const ExecuteExtensionCommandResponseSchema = z.strictObject({});

/** Una posición del documento, base 1. La misma convención que el resto. */
const ExtensionPositionSchema = z.strictObject({
  line: z.number(),
  column: z.number(),
});

/** Un cambio que pide una extensión. */
export const ExtensionTextEditSchema = z.strictObject({
  range: z.strictObject({ start: ExtensionPositionSchema, end: ExtensionPositionSchema }),
  newText: z.string(),
});

/**
 * Payload de `extensions:documentResponse`: la otra mitad del pull.
 *
 * El `requestId` lo eligió el main al preguntar y vuelve acá para correlacionar.
 * Sin él, dos extensiones pidiendo el texto a la vez se llevarían la respuesta
 * de la otra. Ver ADR-0026.
 */
export const DocumentResponseRequestSchema = z.strictObject({
  requestId: z.string().min(1),
  /** El texto pedido, o `null` si el renderer no lo tiene. */
  text: z.string().nullable(),
  /** Si la edición se aplicó. Sólo viaja cuando la pregunta era una edición. */
  applied: z.boolean().optional(),
});

/** Respuesta de `extensions:documentResponse`. */
export const DocumentResponseResponseSchema = z.strictObject({});

/** Payload de `extensions:activeEditorChanged`: el renderer avisa qué está activo. */
export const ActiveEditorChangedRequestSchema = z.strictObject({
  /**
   * El editor activo, o `null` si no hay ninguno.
   *
   * **Sin el texto**, a propósito: si esto arrastrara el contenido, cada tecla
   * serían dos saltos de proceso con el archivo entero adentro. Ver ADR-0026.
   */
  editor: z
    .strictObject({
      path: z.string(),
      languageId: z.string(),
      version: z.number(),
    })
    .nullable(),
});

/** Respuesta de `extensions:activeEditorChanged`. */
export const ActiveEditorChangedResponseSchema = z.strictObject({});

/** Una regla de tokenización de Monaco aportada por un tema. */
const TokenColorRuleSchema = z.strictObject({
  token: z.string(),
  foreground: z.string().optional(),
  fontStyle: z.string().optional(),
});

/**
 * Un tema aportado por una extensión ([RF-906](../../../../docs/03-requerimientos-funcionales.md),
 * [RF-803](../../../../docs/03-requerimientos-funcionales.md)).
 *
 * Viaja con sus colores ya leídos y no con la ruta a su archivo: el renderer no
 * puede leer del disco, y darle una ruta sería pedirle que pida.
 */
export const ExtensionThemeSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  uiTheme: z.enum(['light', 'dark']),
  extension: z.string(),
  /** Sólo lo que el tema pisa; el resto se hereda del `uiTheme`. */
  colors: z.record(z.string(), z.string()),
  tokenColors: z.array(TokenColorRuleSchema),
});
