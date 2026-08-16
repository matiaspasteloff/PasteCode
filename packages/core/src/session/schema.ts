import { z } from 'zod';

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
export const WorkspaceStateSchema = z.looseObject({
  /** Ruta absoluta de la raíz. Se verifica al restaurar. */
  rootPath: z.string().min(1),
  openTabs: z.array(TabStateSchema),
  /** Índice de la pestaña activa. `-1` si no hay ninguna. */
  activeTabIndex: z.int().min(-1),
  /** Carpetas expandidas en el árbol, **relativas** a `rootPath`. */
  expandedFolders: z.array(z.string()),
  /** Momento del último guardado, en epoch ms. */
  lastSavedAt: z.number(),
});

export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
