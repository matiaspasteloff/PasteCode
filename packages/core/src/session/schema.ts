import { z } from 'zod';

import { BreakpointSchema } from '../debug/breakpoints.js';
import { EDITOR_LAYOUTS } from '../workspace/groups.js';

/**
 * Posición del cursor. Base 1 en las dos coordenadas, que es la convención de
 * LSP y la que ya usa el resto del proyecto.
 */
const CursorPositionSchema = z.strictObject({
  line: z.int().min(1),
  column: z.int().min(1),
});

/**
 * Una pestaña, tal como queda guardada entre sesiones.
 *
 * `isDirty` se guarda porque el
 * [modelo de datos](../../../../docs/05-modelo-de-datos.md#estado-del-workspace)
 * lo declara, pero **al restaurar se ignora y toda pestaña vuelve limpia**. Es
 * la única respuesta honesta: no se hace backup del contenido sin guardar, así
 * que al reabrir el archivo es el que está en disco. Un punto de "sin guardar"
 * sobre un archivo idéntico al disco sería mentirle a alguien sobre si perdió
 * su trabajo o no.
 */
export const TabStateSchema = z.strictObject({
  /** URI del recurso: `file:///c:/proyecto/src/index.ts`. */
  uri: z.string().min(1),
  cursorPosition: CursorPositionSchema,
  /** Primera línea visible, para restaurar el scroll. */
  scrollTopLine: z.int().min(1),
  isDirty: z.boolean(),
  isPinned: z.boolean(),
});

export type TabState = z.infer<typeof TabStateSchema>;

/**
 * El estado de un workspace entre sesiones ([RF-707](../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración)).
 *
 * **Es un objeto laxo y no estricto**, que es lo contrario de lo que hace el
 * schema de settings, y a propósito: un `settings.json` lo escribe una persona
 * y una clave desconocida es casi siempre un error de tipeo que hay que
 * señalar. Este archivo no lo escribe nadie a mano —lo escribe la app— así que
 * una clave desconocida significa otra cosa: que lo escribió una versión más
 * nueva de PasteCode. Rechazarlo sería tirar la sesión de alguien que abrió
 * una beta una vez.
 *
 * El caso concreto que viene es `breakpoints`, que el modelo de datos ya lista
 * pero **no define en ninguna parte**: el tipo `Breakpoint` no existe todavía
 * y llega con el DAP en la Etapa 5. Hasta entonces el campo no se escribe, y
 * la laxitud es lo que hace que un archivo que sí lo tenga siga siendo legible.
 */
/** Un grupo de edición, tal como queda guardado. */
export const PersistedGroupSchema = z.strictObject({
  id: z.string().min(1),
  openTabs: z.array(TabStateSchema),
  activeTabIndex: z.int().min(-1),
});

export const WorkspaceStateSchema = z.looseObject({
  /** Ruta absoluta de la raíz. Se verifica al restaurar. */
  rootPath: z.string().min(1),
  openTabs: z.array(TabStateSchema),
  /** Índice de la pestaña activa. `-1` si no hay ninguna. */
  activeTabIndex: z.int().min(-1),
  /** Carpetas expandidas en el árbol, **relativas** a `rootPath`. */
  expandedFolders: z.array(z.string()),
  /**
   * Los grupos de edición, si los escribió una versión que los conoce.
   *
   * **Es opcional y `openTabs` sigue existiendo al lado**, con las pestañas del
   * grupo primario. Ésa es toda la migración: al leer, la ausencia de `groups`
   * significa un solo grupo armado desde `openTabs`; al escribir se escriben
   * las dos formas, así que un build anterior restaura algo sensato en vez de
   * una ventana vacía. Sin bump de versión y sin código de migración, que es
   * para lo que este schema es laxo. Ver
   * [ADR-0023](../../../../docs/adr/0023-dos-grupos-sobre-modelos-compartidos.md).
   */
  groups: z.array(PersistedGroupSchema).optional(),
  layout: z.enum(EDITOR_LAYOUTS).optional(),
  /**
   * Los breakpoints del workspace ([RF-502](../../../../docs/03-requerimientos-funcionales.md)).
   *
   * **Es el campo que este schema viene esperando desde la Etapa 3.** El
   * comentario de arriba lo anunciaba por nombre: `Breakpoint` no existía y
   * llegaba con el DAP. Que el schema sea laxo es lo que permite que aparezca
   * ahora sin migración ni bump de versión, y que un archivo escrito por una
   * versión que lo tiene siga siendo legible por una que no.
   */
  breakpoints: z.array(BreakpointSchema).optional(),
  activeGroupId: z.string().min(1).optional(),
  /** Momento del último guardado, en epoch ms. */
  lastSavedAt: z.number(),
});

export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
export type PersistedGroup = z.infer<typeof PersistedGroupSchema>;

/**
 * Un respaldo de recuperación, tal como queda en disco.
 *
 * Vive acá y no en `ipc-contract` porque **no es un contrato de IPC**: es un
 * formato de archivo, igual que `WorkspaceStateSchema`, y lo lee y lo escribe
 * el mismo proceso. Que además viaje por el IPC al ofrecerlo es una
 * consecuencia, no lo que define dónde va.
 *
 * Estricto y no laxo, al revés que `WorkspaceStateSchema`: un respaldo con
 * claves que no conocemos no es una versión más nueva que hay que respetar, es
 * un archivo que no sabemos interpretar, y ofrecer restaurar algo que no
 * entendemos es peor que no ofrecerlo.
 */
export const BackupFileSchema = z.strictObject({
  /** Ruta absoluta del archivo respaldado. El nombre en disco es su hash. */
  path: z.string().min(1),
  /** Lo que había en el editor sin guardar. */
  content: z.string(),
  /** Cuándo se escribió, en epoch ms. Se compara contra el `mtime` del archivo. */
  savedAt: z.number(),
});

export type BackupFile = z.infer<typeof BackupFileSchema>;
