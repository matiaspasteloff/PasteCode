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

/** Si una herramienta se puede resolver sin confirmación de una persona. */
export function isReadOnlyTool(name: AiToolName): boolean {
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
  write_file: WriteFileArgumentsSchema,
  create_file: WriteFileArgumentsSchema,
} as const satisfies Record<AiToolName, z.ZodType>;

/** Los argumentos ya validados de una herramienta, según cuál sea. */
export type AiToolArguments<N extends AiToolName> = z.infer<(typeof ARGUMENT_SCHEMAS)[N]>;

/**
 * Una herramienta tal como se la declara en la request de OpenRouter.
 *
 * Es el formato de function calling de la API de OpenAI, que es el que
 * OpenRouter expone para todos sus modelos.
 */
export interface AiToolDefinition {
  type: 'function';
  function: {
    name: AiToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Las definiciones que viajan en la request.
 *
 * El JSON Schema se escribe a mano y no se deriva de los schemas Zod de
 * arriba. Suena a duplicación y hay una razón: `z.toJSONSchema` produce un
 * documento con `$schema`, `additionalProperties` y `$ref` que varios modelos
 * gratuitos no digieren, y lo que le llega al modelo tiene que ser lo más
 * chato posible o inventa argumentos. Lo que Zod valida es la **respuesta**
 * del modelo, que es entrada no confiable; esto es la **pregunta**, que es
 * documentación para un lector estadístico. Son dos cosas distintas y por eso
 * no se generan una de la otra.
 *
 * Las descripciones son largas a propósito: es literalmente el único lugar
 * donde se le explica al modelo qué puede y qué no puede hacer.
 */
export const AI_TOOLS: readonly AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'Lista los archivos y carpetas de un directorio del workspace. Usalo antes de leer, para saber qué hay. La ruta es relativa a la raíz del workspace; omitila para listar la raíz.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ruta relativa a la raíz del workspace. Vacía para la raíz.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Lee el contenido completo de un archivo de texto del workspace. Leé siempre antes de proponer una edición: si no leíste el archivo, no sabés qué estás por reemplazar.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ruta del archivo, relativa a la raíz del workspace.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_workspace',
      description:
        'Busca un texto en todos los archivos del workspace y devuelve las coincidencias con su archivo y su línea. Es mucho más barato que leer archivos al azar buscando algo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'El texto o patrón a buscar.' },
          isRegex: {
            type: 'boolean',
            description: 'Si la consulta es una expresión regular.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Propone reemplazar el contenido completo de un archivo que ya existe. NO escribe: la propuesta se le muestra a la persona como un diff y sólo se aplica si la acepta. Mandá el contenido final completo, no un fragmento ni un diff.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ruta del archivo, relativa a la raíz del workspace.',
          },
          content: { type: 'string', description: 'El contenido final completo.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description:
        'Propone crear un archivo nuevo. NO escribe: igual que write_file, la propuesta pasa por la confirmación de la persona. Falla si el archivo ya existe; para ése usá write_file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ruta del archivo nuevo, relativa a la raíz del workspace.',
          },
          content: { type: 'string', description: 'El contenido del archivo.' },
        },
        required: ['path', 'content'],
      },
    },
  },
];

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
