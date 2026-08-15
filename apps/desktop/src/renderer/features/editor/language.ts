/**
 * Extensiones que Monaco no asocia solo, o que conviene fijar.
 *
 * La detección normal la hace Monaco a partir de la extensión del `Uri`, y
 * cubre los ~90 lenguajes básicos. Esta tabla es para los casos en los que no
 * acierta: archivos sin extensión, o nombres completos convencionales.
 */
const BY_FILENAME: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  '.gitignore': 'plaintext',
  '.npmrc': 'ini',
  '.editorconfig': 'ini',
};

/**
 * Lenguaje forzado para un archivo, o `undefined` para dejar decidir a Monaco.
 *
 * Devolver `undefined` no es rendirse: Monaco resuelve la extensión mucho
 * mejor que cualquier tabla que escribamos, y sobrescribirlo con una lista
 * corta sería peor que no hacer nada.
 *
 * @param fileName Nombre del archivo, sin la ruta.
 * @returns El id del lenguaje, o `undefined`.
 * @example
 * languageOverrideFor('Dockerfile'); // 'dockerfile'
 * languageOverrideFor('index.ts');   // undefined
 */
export function languageOverrideFor(fileName: string): string | undefined {
  return BY_FILENAME[fileName.toLowerCase()];
}
