/**
 * Carpetas que no se muestran en el árbol ni se recorren.
 *
 * Es el valor por defecto de `files.exclude` en el
 * [schema de settings](../../../../docs/05-modelo-de-datos.md#schema-de-settings),
 * y por ahora **una constante y no un setting**: las settings son la Etapa 3.
 * Va igual porque sin excluir `node_modules` no se puede abrir este mismo
 * repositorio con PasteCode, que es el checkpoint de la Etapa 2.
 */
export const DEFAULT_EXCLUDES: readonly string[] = ['**/node_modules', '**/.git', '**/dist'];

/**
 * Arma un predicado que dice si una ruta está excluida.
 *
 * Los patrones se compilan una sola vez: el árbol lo consulta una vez por
 * entrada, y con 5.000 archivos la diferencia entre compilar por llamada y
 * compilar una vez es la diferencia entre cumplir [RF-001](../../../../docs/03-requerimientos-funcionales.md)
 * y no cumplirlo.
 *
 * El glob soportado es el mínimo que los patrones por defecto necesitan:
 * `**` para cualquier cantidad de segmentos, `*` para cualquier cosa dentro de
 * un segmento y `?` para un carácter. No hay `{a,b}` ni `[a-z]`. Cuando haga
 * falta más, la alternativa es una dependencia como `picomatch`, no seguir
 * agrandando esto.
 *
 * @param patterns Patrones de exclusión.
 * @returns Predicado sobre rutas **relativas a la raíz**, con `/` como separador.
 * @example
 * const isExcluded = createExclusionMatcher(DEFAULT_EXCLUDES);
 * isExcluded('src/node_modules'); // true
 * isExcluded('src/index.ts');     // false
 */
export function createExclusionMatcher(
  patterns: readonly string[]
): (relativePath: string) => boolean {
  const expressions = patterns.map(globToRegExp);

  return (relativePath) => {
    // Se normaliza acá y no en quien llama: el separador depende del sistema
    // operativo y los patrones no, así que la traducción va de este lado.
    const normalized = relativePath.replaceAll('\\', '/');

    return expressions.some((expression) => expression.test(normalized));
  };
}

/** Compila un glob a una expresión regular anclada. */
function globToRegExp(pattern: string): RegExp {
  const segments = pattern.split('/').filter((segment) => segment !== '');

  const source = segments
    .map((segment, index) => {
      const isLast = index === segments.length - 1;

      // Un `**` final se come todo lo que quede; en el medio, cualquier
      // cantidad de segmentos completos, incluida ninguna.
      if (segment === '**') return isLast ? '.*' : '(?:[^/]*/)*';

      return segmentToSource(segment) + (isLast ? '' : '/');
    })
    .join('');

  return new RegExp(`^${source}$`);
}

/**
 * Traduce un segmento, escapando todo lo que no sea un comodín.
 *
 * El orden importa: primero se escapan los metacaracteres de expresión regular
 * —una lista que no incluye `*` ni `?`, así que los comodines sobreviven— y
 * recién después se los traduce. Al revés, el `[^/]*` recién insertado se
 * volvería a escapar.
 */
function segmentToSource(segment: string): string {
  return segment
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]');
}
