/** Ruta absoluta descompuesta en volumen y segmentos. */
export interface ParsedPath {
  /** `'c:'`, `'\\\\servidor\\recurso'` o `'/'`, ya normalizado para comparar. */
  volume: string;
  /**
   * Segmentos sin `.` ni `..`, **con las mayúsculas originales**. El plegado
   * para comparar lo hace quien compara: el nombre que se muestra en pantalla
   * tiene que conservar cómo lo escribió la persona.
   */
  segments: readonly string[];
  /** Si el volumen no distingue mayúsculas, o sea si es de Windows. */
  isCaseInsensitive: boolean;
}

/** `C:\` o `c:/`. El separador es obligatorio: `C:foo` es relativo al CWD. */
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

/** `\\servidor\recurso`. Sólo con barras invertidas — ver la nota de abajo. */
const UNC_SHARE = /^\\\\[^\\/]+[\\/]+[^\\/]+/;

/**
 * Descompone una ruta absoluta sin tocar el disco y sin depender del sistema
 * donde corre.
 *
 * No usa `node:path` a propósito. `path.parse` y `path.relative` cambian de
 * semántica según la plataforma, así que un caso con `C:\proyecto` pasaría en
 * Windows y fallaría en el runner de Linux del CI. Acá el "sabor" de la ruta
 * se deduce de la ruta misma, y el resultado es igual en las tres plataformas.
 *
 * **UNC sólo con `\\`.** `//servidor/recurso` se lee como ruta POSIX. Es un
 * rechazo de más y nunca uno de menos: quien compara termina viendo dos
 * volúmenes distintos, que es el lado seguro del error.
 *
 * @param raw Ruta a descomponer.
 * @returns La descomposición, o `undefined` si la ruta no es absoluta.
 * @example
 * parseAbsolutePath('C:\\proyecto\\src'); // { volume: 'c:', segments: ['proyecto', 'src'], ... }
 * parseAbsolutePath('src/a.ts');          // undefined
 */
export function parseAbsolutePath(raw: string): ParsedPath | undefined {
  const unc = UNC_SHARE.exec(raw);
  if (unc !== null) {
    const [volume] = unc;
    return {
      // El `\\` inicial es parte del identificador; los separadores internos
      // se colapsan para que `\\srv//recurso` y `\\srv\recurso` sean lo mismo.
      volume: `\\\\${volume.slice(2).replace(/[\\/]+/g, '\\')}`.toLowerCase(),
      segments: toSegments(raw.slice(volume.length)),
      isCaseInsensitive: true,
    };
  }

  if (WINDOWS_DRIVE.test(raw)) {
    return {
      volume: raw.slice(0, 2).toLowerCase(),
      segments: toSegments(raw.slice(2)),
      isCaseInsensitive: true,
    };
  }

  if (raw.startsWith('/')) {
    return { volume: '/', segments: toSegments(raw), isCaseInsensitive: false };
  }

  return undefined;
}

/**
 * Parte por cualquiera de los dos separadores y resuelve `.` y `..`.
 *
 * Un `..` de más se descarta en vez de escapar hacia arriba, que es lo que
 * hacen tanto `path.resolve` como el propio Windows: `C:\..\..\x` es `C:\x`.
 * Escapar sería la opción peligrosa acá.
 */
function toSegments(rest: string): readonly string[] {
  const segments: string[] = [];

  for (const segment of rest.split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments;
}
