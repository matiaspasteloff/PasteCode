import { z } from 'zod';

import { InvalidToolCallError } from '../errors/ai-errors.js';

/**
 * Los nombres de las herramientas, en runtime.
 *
 * Array `as const` y no un enum, igual que `AI_MESSAGE_ROLES`: la unión sale
 * del array y la lista se puede recorrer para armar la definición que se le
 * manda al modelo.
 */
export const AI_TOOL_NAMES = [
  'list_files',
  'read_file',
  'search_workspace',
  'apply_edit',
  'write_file',
  'create_file',
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

/**
 * Las que **no** tocan el disco. Se resuelven enteras en el main.
 *
 * La partición es la decisión de seguridad de [ADR-0029](../../../../docs/adr/0029-asistente-de-ia-en-el-main.md)
 * y por eso es un dato y no un `switch` repartido: agregar una herramienta
 * obliga a decidir de qué lado cae, acá, una sola vez.
 */
export const READ_ONLY_TOOLS = ['list_files', 'read_file', 'search_workspace'] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOLS)[number];

/**
 * Las que sí tocan el disco. Es el complemento exacto de `ReadOnlyToolName`.
 *
 * Sale por `Exclude` y no de una segunda lista a propósito: dos listas que
 * tienen que sumar el total son dos listas que se desincronizan, y la que
 * decide de qué lado cae una herramienta nueva ya es `READ_ONLY_TOOLS`.
 */
export type WriteToolName = Exclude<AiToolName, ReadOnlyToolName>;

/**
 * Si una herramienta se puede resolver sin confirmación de una persona.
 *
 * Es un predicado de tipo y no un booleano a propósito: quien las ejecuta
 * acepta sólo las de lectura, y con un booleano habría que convencer a
 * TypeScript de eso con una aserción o con un `if` redundante. Acá la partición
 * de seguridad y la del sistema de tipos son la misma.
 *
 * @param name La herramienta.
 * @returns `true` si está en `READ_ONLY_TOOLS`, y lo estrecha al tipo.
 * @example
 * if (isReadOnlyTool(name)) await runReadOnlyTool(name, args);
 */
export function isReadOnlyTool(name: AiToolName): name is ReadOnlyToolName {
  const readOnly: readonly string[] = READ_ONLY_TOOLS;

  return readOnly.includes(name);
}

const ListFilesArgumentsSchema = z.strictObject({
  /** Relativa a la raíz del workspace. Vacía o ausente es la raíz. */
  path: z.string().default(''),
});

const ReadFileArgumentsSchema = z.strictObject({
  path: z.string().min(1),
});

const SearchWorkspaceArgumentsSchema = z.strictObject({
  query: z.string().min(1),
  isRegex: z.boolean().default(false),
});

const WriteFileArgumentsSchema = z.strictObject({
  path: z.string().min(1),
  content: z.string(),
});

/**
 * Los argumentos de `apply_edit`: reemplazo exacto de un fragmento.
 *
 * `oldText` pide al menos un carácter porque un `oldText` vacío coincide entre
 * cada par de caracteres del archivo: con `replaceAll` eso inyectaría el texto
 * nuevo en todas partes, y sin él siempre sería "ambiguo". Es un argumento que
 * no tiene ninguna lectura útil, así que se rechaza en el schema.
 */
const ApplyEditArgumentsSchema = z.strictObject({
  path: z.string().min(1),
  oldText: z.string().min(1),
  newText: z.string(),
  replaceAll: z.boolean().default(false),
});

/**
 * El schema de cada herramienta, por nombre.
 *
 * `write_file` y `create_file` comparten forma a propósito: la diferencia no
 * está en los argumentos sino en qué se espera del disco —uno reemplaza, el
 * otro exige que no exista—, y eso lo decide quien la ejecuta.
 */
const ARGUMENT_SCHEMAS = {
  list_files: ListFilesArgumentsSchema,
  read_file: ReadFileArgumentsSchema,
  search_workspace: SearchWorkspaceArgumentsSchema,
  apply_edit: ApplyEditArgumentsSchema,
  write_file: WriteFileArgumentsSchema,
  create_file: WriteFileArgumentsSchema,
} as const satisfies Record<AiToolName, z.ZodType>;

/** Los argumentos ya validados de una herramienta, según cuál sea. */
export type AiToolArguments<N extends AiToolName> = z.infer<(typeof ARGUMENT_SCHEMAS)[N]>;

/**
 * Si un string cualquiera nombra una herramienta que existe.
 *
 * Hace falta en runtime porque `AiToolName` se borra al compilar y lo que
 * llega es lo que el modelo escribió, que puede ser cualquier cosa.
 *
 * @param value El nombre que mandó el modelo.
 * @returns `true` sólo para los nombres de `AI_TOOL_NAMES`.
 * @example
 * isToolName('read_file'); // true
 * isToolName('rm_rf'); // false
 */
export function isToolName(value: unknown): value is AiToolName {
  const names: readonly string[] = AI_TOOL_NAMES;

  return typeof value === 'string' && names.includes(value);
}

/**
 * Valida los argumentos que el modelo mandó para una herramienta.
 *
 * **Lo que devuelve un modelo es entrada no confiable**, exactamente igual que
 * lo que manda el renderer: puede mandar JSON roto, omitir un argumento
 * obligatorio, o inventar uno que no existe. La diferencia con el renderer es
 * que acá el que empuja puede ser el contenido de un archivo del workspace, y
 * ese archivo lo pudo escribir cualquiera.
 *
 * Los argumentos llegan como **string** y no como objeto: así los manda la
 * API de function calling, y el modelo produce JSON inválido más seguido de lo
 * que uno esperaría.
 *
 * @param name Nombre de la herramienta, ya verificado con `isToolName`.
 * @param raw El JSON de argumentos, tal como vino.
 * @returns Los argumentos validados, con los defaults aplicados.
 * @throws {InvalidToolCallError} Si el JSON no parsea o no cumple el schema.
 * @example
 * parseToolArguments('read_file', '{"path":"src/a.ts"}'); // { path: 'src/a.ts' }
 */
export function parseToolArguments<N extends AiToolName>(
  name: N,
  raw: string
): AiToolArguments<N> {
  const schema = ARGUMENT_SCHEMAS[name];
  const parsed = schema.safeParse(toJson(name, raw));

  if (!parsed.success) {
    throw new InvalidToolCallError(name, parsed.error.issues.map(describeIssue).join('; '));
  }

  // El límite del sistema: `ARGUMENT_SCHEMAS[name]` se indexa con un genérico,
  // y TypeScript no puede relacionar el schema elegido con `AiToolArguments<N>`
  // sin resolver `N`. La aserción está permitida acá por la regla 2 de
  // codigo.md; lo que la sostiene es que las dos expresiones se indexan con el
  // mismo `N` sobre el mismo objeto.
  // eslint-disable-next-line no-restricted-syntax
  return parsed.data as AiToolArguments<N>;
}

/**
 * Cómo salió un reemplazo exacto de `apply_edit`.
 *
 * Es un resultado devuelto y no una excepción ([regla 3 de codigo.md](../../../../docs/convenciones/codigo.md#3-los-errores-esperables-se-devuelven-no-se-lanzan)):
 * que el fragmento no aparezca es el caso **esperable** cuando un modelo copia
 * a ojo, no una falla del programa. Quien llama lo traduce a un texto que el
 * modelo pueda leer para reintentar.
 */
export type ExactEditResult =
  | { ok: true; content: string; replacements: number }
  | { ok: false; reason: 'not-found' | 'ambiguous'; occurrences: number };

/**
 * Reemplaza un fragmento exacto dentro de un texto.
 *
 * **Comparación literal, sin expresiones regulares.** `oldText` viene del
 * modelo y puede traer cualquier carácter; pasarlo por `RegExp` convertiría un
 * `.` o un `(` en un metacarácter y haría que el reemplazo tocara un lugar que
 * nadie pidió. Con `split`/`join` lo que se busca es exactamente lo que se
 * mandó.
 *
 * Que una coincidencia ambigua **falle** en vez de tomar la primera es la
 * decisión que hace que esta herramienta sea segura: dos apariciones iguales
 * significan que el modelo no miró suficiente contexto, y elegir por él es
 * elegir mal la mitad de las veces.
 *
 * @param content El contenido actual del archivo.
 * @param edit El fragmento a reemplazar, el nuevo, y si van todas.
 * @returns El contenido nuevo, o por qué no se pudo.
 * @example
 * applyExactEdit('a b a', { oldText: 'b', newText: 'c', replaceAll: false });
 */
export function applyExactEdit(
  content: string,
  edit: { oldText: string; newText: string; replaceAll: boolean }
): ExactEditResult {
  const parts = content.split(edit.oldText);
  const occurrences = parts.length - 1;

  if (occurrences === 0) return { ok: false, reason: 'not-found', occurrences: 0 };

  if (occurrences > 1 && !edit.replaceAll) {
    return { ok: false, reason: 'ambiguous', occurrences };
  }

  // Llegado acá, o hay una sola aparición o se pidieron todas: en los dos
  // casos el `join` de todas las partes es exactamente lo que corresponde.
  return { ok: true, content: parts.join(edit.newText), replacements: occurrences };
}

/** Parsea el JSON, traduciendo el fallo al error del proyecto. */
function toJson(name: AiToolName, raw: string): unknown {
  // Un modelo que no llama a la herramienta con argumentos manda `''` o `{}`.
  // El primero no es JSON válido y el schema con defaults ya cubre el segundo.
  if (raw.trim() === '') return {};

  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new InvalidToolCallError(
      name,
      `los argumentos no son JSON válido (${String(cause)})`
    );
  }
}

/** Un issue de Zod, en una línea que se le pueda devolver al modelo. */
function describeIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.');

  return path === '' ? issue.message : `${path}: ${issue.message}`;
}
