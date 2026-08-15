import { z } from 'zod';

/**
 * Un workspace abierto.
 *
 * El `name` viaja junto al `root` en vez de que el renderer lo derive: sacar
 * el último segmento de una ruta es `basename`, y el renderer no puede
 * importar `node:path`. Hacerlo a mano con un `split` sería un parser de rutas
 * de Windows escondido en un componente de React.
 */
export const WorkspaceInfoSchema = z.strictObject({
  root: z.string().min(1),
  name: z.string().min(1),
});

/** Un workspace abierto, tal como lo ven el main y el renderer. */
export type WorkspaceInfo = z.infer<typeof WorkspaceInfoSchema>;

/** Payload de `workspace:open`. Sin datos: la carpeta la elige el diálogo. */
export const OpenWorkspaceRequestSchema = z.strictObject({});

/**
 * Respuesta de `workspace:open`. `null` significa que la persona canceló el
 * diálogo, que no es un error: es una respuesta válida.
 */
export const OpenWorkspaceResponseSchema = WorkspaceInfoSchema.nullable();

/** Payload de `workspace:getRoot`. */
export const GetWorkspaceRootRequestSchema = z.strictObject({});

/**
 * Respuesta de `workspace:getRoot`. `null` si no hay ninguno abierto.
 *
 * Devuelve la misma forma que `workspace:open` a propósito, aunque la tabla
 * del plan de la etapa proponía `{ root: string | null }`: el renderer guarda
 * lo mismo en el store venga de donde venga, y con dos formas distintas
 * tendría que normalizarlas —y para eso necesitaría derivar el `name`, que es
 * justamente lo que no puede hacer.
 */
export const GetWorkspaceRootResponseSchema = WorkspaceInfoSchema.nullable();
