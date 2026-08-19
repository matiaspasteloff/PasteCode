import { z } from 'zod';

/**
 * Una configuración de debug del `launch.json`.
 *
 * **Es deliberadamente laxa en el medio y estricta en los bordes.** `type`,
 * `request` y `name` son lo único que el IDE necesita para poblar el selector y
 * arrancar la sesión; todo lo demás —`program`, `args`, `cwd`, `port`,
 * `skipFiles`— lo interpreta el **adaptador**, y cada uno tiene los suyos. Un
 * schema estricto acá obligaría a transcribir a mano la documentación de cada
 * adaptador que exista y a quedar desactualizado con el primero que agregue una
 * opción. Ver [ADR-0028](../../../../docs/adr/0028-adaptador-dap-externo-y-cliente-propio.md).
 *
 * Lo que sí se rechaza es una configuración sin `name`, sin `type` o con un
 * `request` que no es `launch` ni `attach`: sin eso no hay nada que mostrar ni
 * nada que mandar, y el error tiene que verse al abrir el archivo.
 */
export const LaunchConfigurationSchema = z.looseObject({
  /** Qué adaptador la entiende. Por ejemplo `node` o `python`. */
  type: z.string().min(1),
  /** Si se lanza un proceso nuevo o se engancha a uno que ya corre. */
  request: z.enum(['launch', 'attach']),
  /** Lo que se ve en el selector. Tiene que ser único dentro del archivo. */
  name: z.string().min(1),
});

export type LaunchConfiguration = z.infer<typeof LaunchConfigurationSchema>;

/**
 * El archivo `.pastecode/launch.json` entero
 * ([RF-501](../../../../docs/03-requerimientos-funcionales.md)).
 *
 * `version` viaja pero no se valida contra un literal: es el mismo campo que
 * usa VS Code, y rechazar un `"0.2.0"` ajeno haría que un `launch.json` que
 * alguien ya tiene escrito no sirva para nada.
 */
export const LaunchFileSchema = z.looseObject({
  version: z.string().optional(),
  configurations: z.array(LaunchConfigurationSchema),
});

export type LaunchFile = z.infer<typeof LaunchFileSchema>;

/** Qué se pudo leer del archivo, o por qué no. */
export type LaunchFileResult =
  { configurations: LaunchConfiguration[] } | { error: { code: string; userMessage: string } };

/**
 * Interpreta el contenido de un `launch.json`.
 *
 * **Acepta comentarios.** El `launch.json` del ecosistema es JSONC: la gente
 * comenta sus configuraciones, y rechazar el archivo entero por una línea que
 * empieza con `//` sería rechazar el formato que todos escriben. Se sacan antes
 * de parsear, que es lo mismo que hace el editor.
 *
 * Un archivo inválido **no es una excepción**: es un resultado con su mensaje,
 * porque quien lo escribió tiene que verlo y arreglarlo, y el resto del IDE
 * tiene que seguir andando.
 *
 * @param raw El contenido del archivo.
 * @returns Las configuraciones, o el error que impide leerlas.
 * @example
 * readLaunchFile('{ "configurations": [] }');
 */
export function readLaunchFile(raw: string): LaunchFileResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripComments(raw));
  } catch (cause) {
    return {
      error: {
        code: 'LAUNCH_JSON_INVALID',
        userMessage: `El launch.json no es JSON válido: ${describe(cause)}`,
      },
    };
  }

  const validated = LaunchFileSchema.safeParse(parsed);

  if (!validated.success) {
    const issue = validated.error.issues[0];

    return {
      error: {
        code: 'LAUNCH_JSON_SCHEMA',
        userMessage: `El launch.json tiene un problema${
          issue === undefined ? '' : ` en "${issue.path.join('.')}": ${issue.message}`
        }.`,
      },
    };
  }

  return { configurations: validated.data.configurations };
}

/**
 * Saca los comentarios de un JSONC, respetando los que están adentro de strings.
 *
 * La parte de los strings **no es paranoia**: una ruta de Windows en un
 * `program` es `"C:\\\\proyecto\\\\app.js"`, y un `//` adentro de una URL es lo
 * más común del mundo. Un reemplazo ingenuo de `//` a fin de línea rompe los
 * dos casos y el error que produce apunta a otro lado.
 */
function stripComments(raw: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let index = 0;

  while (index < raw.length) {
    const char = raw[index] ?? '';

    if (inString) {
      result += char;
      inString = !(char === '"' && !escaped);
      escaped = char === '\\' && !escaped;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      escaped = false;
      result += char;
      index += 1;
      continue;
    }

    const rest = raw.slice(index, index + 2);

    if (rest === '//') {
      index = endOfLine(raw, index);
      continue;
    }

    if (rest === '/*') {
      index = endOfBlock(raw, index);
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/** El índice del salto de línea que cierra un comentario de línea. */
function endOfLine(raw: string, from: number): number {
  const next = raw.indexOf('\n', from);

  return next === -1 ? raw.length : next;
}

/** El índice justo después del cierre de un comentario de bloque. */
function endOfBlock(raw: string, from: number): number {
  const next = raw.indexOf('*/', from + 2);

  return next === -1 ? raw.length : next + 2;
}

/** El mensaje de lo que sea que se haya lanzado. */
function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
