import { WorkspaceStateSchema } from '@pastecode/core';
import { z } from 'zod';

/**
 * Payload de `session:load`.
 *
 * No lleva la raíz: el main ya sabe cuál es el workspace abierto, y dejar que
 * el renderer la mande sería dejarle elegir de qué workspace leer la sesión.
 */
export const LoadSessionRequestSchema = z.strictObject({});

/**
 * Respuesta de `session:load`: la sesión **ya filtrada**, o `null` si es la
 * primera vez que se abre este workspace.
 *
 * El filtrado lo hace el main y no el renderer, y no es un detalle de reparto
 * de tareas: el renderer no puede saber qué archivos existen sin pedirlos, y
 * pedir uno que se borró entre sesiones deja un error en pantalla. El descarte
 * silencioso de [RF-707](../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración)
 * sólo es silencioso si ocurre antes de cruzar el IPC.
 */
export const LoadSessionResponseSchema = z.strictObject({
  state: z
    .strictObject({
      openTabs: WorkspaceStateSchema.shape.openTabs,
      activeTabIndex: WorkspaceStateSchema.shape.activeTabIndex,
      expandedFolders: WorkspaceStateSchema.shape.expandedFolders,
      // Opcionales: una sesión escrita por una versión anterior al split no los
      // tiene, y ausencia significa "un solo grupo, armado desde `openTabs`".
      groups: WorkspaceStateSchema.shape.groups,
      layout: WorkspaceStateSchema.shape.layout,
      activeGroupId: WorkspaceStateSchema.shape.activeGroupId,
      /** Ausente en una sesión escrita antes del DAP: son cero breakpoints. */
      breakpoints: WorkspaceStateSchema.shape.breakpoints,
    })
    .nullable(),
});

/**
 * Payload de `session:save`.
 *
 * El `lastSavedAt` lo pone el main y no el renderer: es la marca de cuándo se
 * escribió el archivo, y el reloj del que escribe es el único que la puede
 * dar sin mentir.
 */
export const SaveSessionRequestSchema = z.strictObject({
  /** El grupo primario, espejado. Es lo que lee un build anterior al split. */
  openTabs: WorkspaceStateSchema.shape.openTabs,
  activeTabIndex: WorkspaceStateSchema.shape.activeTabIndex,
  expandedFolders: WorkspaceStateSchema.shape.expandedFolders,
  groups: WorkspaceStateSchema.shape.groups,
  layout: WorkspaceStateSchema.shape.layout,
  activeGroupId: WorkspaceStateSchema.shape.activeGroupId,
  /** Los breakpoints del workspace (RF-502). */
  breakpoints: WorkspaceStateSchema.shape.breakpoints,
});

/** Respuesta de `session:save`. */
export const SaveSessionResponseSchema = z.strictObject({});
