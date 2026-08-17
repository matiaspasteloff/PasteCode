import { z } from 'zod';

/** Los cinco estados que la UI pinta. Es la unión de `GitFileStatus` de core. */
export const GIT_FILE_STATUSES = [
  'added',
  'modified',
  'deleted',
  'renamed',
  'untracked',
  'conflict',
] as const;

/** Un archivo con cambios, con sus dos estados. Rutas relativas a la raíz del repo. */
export const GitFileChangeSchema = z.strictObject({
  path: z.string().min(1),
  indexStatus: z.enum(GIT_FILE_STATUSES).nullable(),
  worktreeStatus: z.enum(GIT_FILE_STATUSES).nullable(),
  originalPath: z.string().min(1).nullable(),
});

/** En qué rama está y cuánto se desvió de su upstream. */
export const GitBranchInfoSchema = z.strictObject({
  /** `null` si el HEAD está suelto. */
  name: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.int().min(0),
  behind: z.int().min(0),
});

/** El repositorio abierto, con todo lo que la UI necesita de una sola vez. */
export const GitRepositorySchema = z.strictObject({
  /** Raíz del repositorio, tal como la reportó `rev-parse --show-toplevel`. */
  root: z.string().min(1),
  branch: GitBranchInfoSchema,
  changes: z.array(GitFileChangeSchema),
});

/** Payload de `git:getStatus`. */
export const GetGitStatusRequestSchema = z.strictObject({});

/**
 * Respuesta de `git:getStatus`.
 *
 * `repository` en `null` es "no hay git, o `git.enabled` está apagado, o esta
 * carpeta no es un repositorio". Los tres casos se ven igual desde la UI —el
 * icono del rail y el indicador de rama no se dibujan— y distinguirlos sería
 * pedirle a la persona que le importe la diferencia.
 */
export const GetGitStatusResponseSchema = z.strictObject({
  repository: GitRepositorySchema.nullable(),
});

/** Payload de `git:stage` y `git:unstage`: rutas relativas a la raíz del repo. */
export const GitPathsRequestSchema = z.strictObject({
  paths: z.array(z.string().min(1)).min(1),
});

export const GitPathsResponseSchema = z.strictObject({});

/**
 * Payload de `git:commit`.
 *
 * El mensaje viaja tal cual lo escribió la persona y llega a git como **un
 * elemento de `argv`**, nunca interpolado.
 */
export const GitCommitRequestSchema = z.strictObject({
  message: z.string().min(1),
});

export const GitCommitResponseSchema = z.strictObject({});

export const ListBranchesRequestSchema = z.strictObject({});

export const ListBranchesResponseSchema = z.strictObject({
  branches: z.array(z.string().min(1)),
});

export const CheckoutBranchRequestSchema = z.strictObject({
  branch: z.string().min(1),
});

export const CheckoutBranchResponseSchema = z.strictObject({});

export type GitRepository = z.infer<typeof GitRepositorySchema>;
