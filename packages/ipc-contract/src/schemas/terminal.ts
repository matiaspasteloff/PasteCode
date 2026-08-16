import { z } from 'zod';

/**
 * Una sesión de terminal, tal como la ve el renderer.
 *
 * El `pid` viaja porque es lo que hace verificable a
 * [RF-305](../../../../docs/03-requerimientos-funcionales.md#terminal-integrada):
 * el test de procesos huérfanos necesita algo que buscar en la tabla de
 * procesos después de cerrar la app.
 */
export const TerminalSessionSchema = z.strictObject({
  sessionId: z.string().min(1),
  displayName: z.string().min(1),
  pid: z.int(),
});

export type TerminalSession = z.infer<typeof TerminalSessionSchema>;

/**
 * Payload de `terminal:create`: el tamaño inicial de la grilla, en celdas.
 *
 * Lo manda el renderer porque es el único que lo sabe: depende del alto del
 * panel y del tamaño de fuente, y el main no tiene layout.
 *
 * Se valida el rango acá y se **acota** en `packages/core/src/terminal`: son
 * dos cosas distintas. Un `cols: -1` es el renderer mandando algo imposible y
 * se rechaza; un `cols: 4` es xterm midiendo un panel que todavía no terminó
 * de aparecer, y ahí acotar es lo correcto, porque pasarle 4 columnas a conpty
 * deja el shell escribiendo en una línea de cuatro caracteres.
 *
 * La respuesta de este canal es un `TerminalSessionSchema`.
 */
export const CreateTerminalRequestSchema = z.strictObject({
  cols: z.int().positive(),
  rows: z.int().positive(),
});

/**
 * Payload de `terminal:write`: lo que el usuario tecleó.
 *
 * Va tal cual, sin interpretar. El byte 0x03 es Ctrl+C y tiene que llegar al
 * PTY como tal para que el shell mate al proceso en primer plano; tratarlo
 * como texto sería romper la terminal.
 */
export const WriteTerminalRequestSchema = z.strictObject({
  sessionId: z.string().min(1),
  data: z.string(),
});

/** Respuesta de `terminal:write`. No hay nada que devolver. */
export const WriteTerminalResponseSchema = z.strictObject({});

/** Payload de `terminal:resize` ([RF-303](../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)). */
export const ResizeTerminalRequestSchema = z.strictObject({
  sessionId: z.string().min(1),
  cols: z.int().positive(),
  rows: z.int().positive(),
});

/** Respuesta de `terminal:resize`. */
export const ResizeTerminalResponseSchema = z.strictObject({});

/** Payload de `terminal:dispose`: cerrar una sesión desde la UI. */
export const DisposeTerminalRequestSchema = z.strictObject({
  sessionId: z.string().min(1),
});

/** Respuesta de `terminal:dispose`. */
export const DisposeTerminalResponseSchema = z.strictObject({});

/** Payload de `terminal:list`. */
export const ListTerminalsRequestSchema = z.strictObject({});

/**
 * Respuesta de `terminal:list`: las sesiones vivas.
 *
 * Existe para que el renderer pueda reconstruir el dropdown de
 * [RF-302](../../../../docs/03-requerimientos-funcionales.md#terminal-integrada)
 * sin ser la fuente de verdad de qué sesiones hay. El main es el único que
 * sabe cuáles siguen vivas, porque es el único que ve morir a un proceso.
 */
export const ListTerminalsResponseSchema = z.strictObject({
  sessions: z.array(TerminalSessionSchema),
});
