/**
 * Ruta absoluta descompuesta en la parte que identifica el volumen y la lista
 * de segmentos que cuelga de ella.
 */
interface ParsedPath {
  /** `'c:'`, `'\\\\servidor\\recurso'` o `'/'`, ya normalizado para comparar. */
  volume: string;
  /** Segmentos sin `.` ni `..`, ya plegados a minúsculas si el volumen lo es. */
  segments: readonly string[];
}

/** `C:\` o `c:/`. El separador es obligatorio: `C:foo` es relativo al CWD. */
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

/** `\\servidor\recurso`. Sólo con barras invertidas — ver la nota de abajo. */
const UNC_SHARE = /^\\\\[^\\/]+[\\/]+[^\\/]+/;

/**
 * Decide si `candidate` está contenida en `root`.
 *
 * **Es la parte pura de la validación de rutas**
 * ([RNF-11](../../../../docs/04-requerimientos-no-funcionales.md)). Recibe dos
 * rutas absolutas ya resueltas —quien llama es el responsable de haber pasado
 * por `realpath`, porque eso es I/O y acá no entra— y responde una sola
 * pregunta, sin efectos.
 *
 * No usa `node:path` a propósito. `path.relative` cambia de semántica según el
 * sistema donde corre, así que un caso con `C:\proyecto` pasaría en Windows y
 * fallaría en el runner de Linux del CI. Acá el "sabor" de la ruta se deduce
 * de la ruta misma, no del proceso, y el resultado es el mismo en las tres
 * plataformas.
 *
 * Detalles que valen la aclaración:
 *
 * - **La raíz está contenida en sí misma.** El árbol de archivos necesita
 *   listar el workspace, y esa llamada pasa por el mismo guard.
 * - **Las rutas de Windows se comparan sin distinguir mayúsculas** porque el
 *   filesystem tampoco las distingue: `C:\PROJ` y `c:\proj` son la misma
 *   carpeta. Las rutas POSIX se comparan exacto, que es la dirección
 *   conservadora en un macOS con APFS insensible.
 * - **UNC sólo con `\\`.** `//servidor/recurso` se lee como ruta POSIX, así
 *   que contra una raíz de Windows da `false`. Es un rechazo de más, nunca uno
 *   de menos, y quien llama ya normalizó con `resolve` antes de llegar acá.
 *
 * @param root Raíz del workspace, absoluta.
 * @param candidate Ruta a verificar, absoluta.
 * @returns `true` si `candidate` es la raíz o cuelga de ella.
 * @example
 * isInsideRoot('C:\\proyecto', 'c:\\PROYECTO\\src\\a.ts'); // true
 * isInsideRoot('C:\\proyecto', 'C:\\proyecto2\\a.ts');     // false
 * isInsideRoot('/home/matias/p', '/etc/passwd');           // false
 */
export function isInsideRoot(root: string, candidate: string): boolean {
  const parsedRoot = parseAbsolutePath(root);
  const parsedCandidate = parseAbsolutePath(candidate);

  if (parsedRoot === undefined || parsedCandidate === undefined) return false;
  if (parsedRoot.volume !== parsedCandidate.volume) return false;
  if (parsedCandidate.segments.length < parsedRoot.segments.length) return false;

  return parsedRoot.segments.every(
    (segment, index) => segment === parsedCandidate.segments[index]
  );
}

/** `undefined` cuando la ruta no es absoluta: sin raíz no hay nada que comparar. */
function parseAbsolutePath(raw: string): ParsedPath | undefined {
  const unc = UNC_SHARE.exec(raw);
  if (unc !== null) {
    const [volume] = unc;
    return {
      // El `\\` inicial es parte del identificador; los separadores internos
      // se colapsan para que `\\srv//recurso` y `\\srv\recurso` sean lo mismo.
      volume: `\\\\${volume.slice(2).replace(/[\\/]+/g, '\\')}`.toLowerCase(),
      segments: toSegments(raw.slice(volume.length), true),
    };
  }

  if (WINDOWS_DRIVE.test(raw)) {
    return { volume: raw.slice(0, 2).toLowerCase(), segments: toSegments(raw.slice(2), true) };
  }

  if (raw.startsWith('/')) return { volume: '/', segments: toSegments(raw, false) };

  return undefined;
}

/**
 * Parte por cualquiera de los dos separadores y resuelve `.` y `..`.
 *
 * Un `..` de más se descarta en vez de escapar hacia arriba, que es lo que
 * hacen tanto `path.resolve` como el propio Windows: `C:\..\..\x` es `C:\x`.
 * Escapar sería la opción peligrosa acá.
 */
function toSegments(rest: string, isCaseInsensitive: boolean): readonly string[] {
  const segments: string[] = [];

  for (const raw of rest.split(/[\\/]+/)) {
    if (raw === '' || raw === '.') continue;
    if (raw === '..') {
      segments.pop();
      continue;
    }
    segments.push(isCaseInsensitive ? raw.toLowerCase() : raw);
  }

  return segments;
}
