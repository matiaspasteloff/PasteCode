import type { AiToolName } from './tools.js';

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
 * Viven en un archivo propio y no en [`tools.ts`](./tools.ts) por dos razones
 * que se refuerzan: el archivo de al lado ya estaba cerca del techo de 400
 * líneas de RNF-20, y `toolsForMode` de [`modes.ts`](./modes.ts) necesita
 * filtrar **esta** lista sin arrastrar la validación de argumentos, que es lo
 * que habría hecho circular el import.
 *
 * El JSON Schema se escribe a mano y no se deriva de los schemas Zod de
 * `tools.ts`. Suena a duplicación y hay una razón: `z.toJSONSchema` produce un
 * documento con `$schema`, `additionalProperties` y `$ref` que varios modelos
 * gratuitos no digieren, y lo que le llega al modelo tiene que ser lo más
 * chato posible o inventa argumentos. Lo que Zod valida es la **respuesta**
 * del modelo, que es entrada no confiable; esto es la **pregunta**, que es
 * documentación para un lector estadístico. Son dos cosas distintas y por eso
 * no se generan una de la otra.
 *
 * Las descripciones son largas a propósito: es literalmente el único lugar
 * donde se le explica al modelo qué puede y qué no puede hacer.
 *
 * **Las de escritura no dicen si escriben o no.** Eso depende del modo y lo
 * dice el prompt de sistema (ver `modeInstructions`): una descripción que
 * afirmara "no escribe" sería falsa en modo agente, y una que afirmara lo
 * contrario sería falsa en los otros dos. Acá va sólo lo que es cierto en los
 * tres.
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
        'Lee el contenido completo de un archivo de texto del workspace. Leé siempre antes de editar: si no leíste el archivo, no sabés qué estás por reemplazar.',
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
      name: 'apply_edit',
      description:
        'Cambia un fragmento exacto de un archivo que ya existe. Es la forma preferida de editar: mandás sólo el texto que se reemplaza y el que va en su lugar, en vez del archivo entero. "oldText" tiene que aparecer tal cual —espacios y saltos de línea incluidos— y una sola vez, salvo que mandes replaceAll. Si no aparece, o aparece más de una vez, te lo digo y podés reintentar con más contexto alrededor.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ruta del archivo, relativa a la raíz del workspace.',
          },
          oldText: {
            type: 'string',
            description: 'El fragmento a reemplazar, exacto y único en el archivo.',
          },
          newText: { type: 'string', description: 'Lo que va en su lugar.' },
          replaceAll: {
            type: 'boolean',
            description: 'Reemplazar todas las apariciones en vez de exigir que haya una sola.',
          },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Reemplaza el contenido completo de un archivo que ya existe. Mandá el contenido final completo, no un fragmento ni un diff. Para un cambio puntual usá apply_edit, que es más barato y falla menos.',
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
        'Crea un archivo nuevo con el contenido que le des. Falla si el archivo ya existe; para ése usá write_file o apply_edit.',
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
