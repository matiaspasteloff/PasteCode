/**
 * A qué familia de icono pertenece un archivo.
 *
 * **Ocho familias, no ochenta lenguajes.** Un color y un glifo por lenguaje es
 * un mapa que hay que mantener para siempre, que nunca está completo y que
 * nadie lee: en el árbol, el color no dice "esto es Rust", dice "esto es
 * código y aquello es configuración". Ocho familias alcanzan para escanear una
 * carpeta de un vistazo, que es lo único que el color hace acá.
 */
export const FILE_ICON_KINDS = [
  'code',
  'markup',
  'style',
  'data',
  'doc',
  'config',
  'image',
  'default',
] as const;

export type FileIconKind = (typeof FILE_ICON_KINDS)[number];

/**
 * Extensión → familia.
 *
 * Se busca por la extensión completa en minúscula, sin el punto. Lo que no
 * está cae en `default`, que es el comportamiento correcto: un archivo sin
 * icono propio se ve como un archivo, no como un error.
 */
const BY_EXTENSION = new Map<string, FileIconKind>([
  ['ts', 'code'],
  ['tsx', 'code'],
  ['js', 'code'],
  ['jsx', 'code'],
  ['mjs', 'code'],
  ['cjs', 'code'],
  ['py', 'code'],
  ['rs', 'code'],
  ['go', 'code'],
  ['java', 'code'],
  ['c', 'code'],
  ['h', 'code'],
  ['cpp', 'code'],
  ['cs', 'code'],
  ['rb', 'code'],
  ['php', 'code'],
  ['sh', 'code'],
  ['ps1', 'code'],

  ['html', 'markup'],
  ['htm', 'markup'],
  ['xml', 'markup'],
  ['svg', 'markup'],
  ['vue', 'markup'],

  ['css', 'style'],
  ['scss', 'style'],
  ['sass', 'style'],
  ['less', 'style'],

  ['json', 'data'],
  ['jsonc', 'data'],
  ['yaml', 'data'],
  ['yml', 'data'],
  ['toml', 'data'],
  ['csv', 'data'],
  ['sql', 'data'],

  ['md', 'doc'],
  ['mdx', 'doc'],
  ['txt', 'doc'],
  ['rst', 'doc'],
  ['pdf', 'doc'],

  ['png', 'image'],
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['gif', 'image'],
  ['webp', 'image'],
  ['ico', 'image'],
  ['avif', 'image'],
]);

/**
 * Nombres completos que mandan sobre la extensión.
 *
 * Un `.gitignore` no tiene extensión y un `tsconfig.json` no es un archivo de
 * datos cualquiera: son configuración, y en un árbol de proyecto eso es
 * justamente lo que conviene poder saltear con la vista.
 */
const BY_NAME = new Map<string, FileIconKind>([
  ['.gitignore', 'config'],
  ['.gitattributes', 'config'],
  ['.npmrc', 'config'],
  ['.editorconfig', 'config'],
  ['.prettierrc', 'config'],
  ['dockerfile', 'config'],
  ['makefile', 'config'],
  ['license', 'doc'],
  ['readme', 'doc'],
  ['package.json', 'config'],
  ['tsconfig.json', 'config'],
  ['pnpm-workspace.yaml', 'config'],
  ['pnpm-lock.yaml', 'config'],
  ['turbo.json', 'config'],
  ['knip.jsonc', 'config'],
]);

/**
 * La familia de icono de un archivo, por su nombre.
 *
 * Recibe el **nombre** y no la ruta: quien tiene la ruta ya la partió para
 * mostrar el nombre en la fila del árbol, y hacer que esto la parta otra vez
 * obligaría a saber si el separador es `/` o `\`, que es exactamente el tipo
 * de cosa que hace que un test pase en Windows y falle en el runner de Linux.
 *
 * @param name Nombre del archivo, sin carpeta.
 * @returns Una de las ocho familias. Nunca falla.
 * @example
 * fileIconFor('App.tsx');       // 'code'
 * fileIconFor('tsconfig.json'); // 'config'
 * fileIconFor('.gitignore');    // 'config'
 * fileIconFor('notas');         // 'default'
 */
export function fileIconFor(name: string): FileIconKind {
  const lower = name.toLowerCase();
  const byName = BY_NAME.get(lower);

  if (byName !== undefined) return byName;

  // El **último** punto, y sólo si no es el primer carácter: `foo.spec.ts` es
  // TypeScript y `.gitignore` no tiene extensión —ahí el punto es parte del
  // nombre—. Buscar el primer punto rompe el primer caso, que en este
  // repositorio es la mitad de los archivos.
  const dot = lower.lastIndexOf('.');

  if (dot <= 0) return 'default';

  return BY_EXTENSION.get(lower.slice(dot + 1)) ?? 'default';
}
