import { parseAbsolutePath, type ParsedPath } from './absolute-path.js';

/**
 * Decide si `candidate` está contenida en `root`.
 *
 * **Es la parte pura de la validación de rutas**
 * ([RNF-11](../../../../docs/04-requerimientos-no-funcionales.md)). Recibe dos
 * rutas absolutas ya resueltas —quien llama es el responsable de haber pasado
 * por `realpath`, porque eso es I/O y acá no entra— y responde una sola
 * pregunta, sin efectos.
 *
 * Detalles que valen la aclaración:
 *
 * - **La raíz está contenida en sí misma.** El árbol de archivos necesita
 *   listar el workspace, y esa llamada pasa por el mismo guard.
 * - **Las rutas de Windows se comparan sin distinguir mayúsculas** porque el
 *   filesystem tampoco las distingue: `C:\PROJ` y `c:\proj` son la misma
 *   carpeta. Las rutas POSIX se comparan exacto, que es la dirección
 *   conservadora en un macOS con APFS insensible.
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

  const rootSegments = comparableSegments(parsedRoot);
  const candidateSegments = comparableSegments(parsedCandidate);

  return rootSegments.every((segment, index) => segment === candidateSegments[index]);
}

/**
 * Los segmentos tal como hay que compararlos.
 *
 * El plegado se hace acá y no al parsear porque el mismo análisis alimenta al
 * nombre que se muestra en pantalla, y ése tiene que conservar las mayúsculas
 * que escribió la persona.
 */
function comparableSegments(parsed: ParsedPath): readonly string[] {
  if (!parsed.isCaseInsensitive) return parsed.segments;

  return parsed.segments.map((segment) => segment.toLowerCase());
}
