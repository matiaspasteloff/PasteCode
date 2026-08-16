/**
 * Los argumentos de cada comando de git, como arrays.
 *
 * **Devuelven arrays y nunca líneas de comando**, por lo mismo que
 * `buildRipgrepArgs`: un array llega al sistema operativo como `argv`, sin
 * pasar por ningún intérprete, así que un mensaje de commit con comillas,
 * saltos de línea o `&&` es un mensaje y no un comando nuevo. Ver
 * [seguridad.md](../../../../docs/convenciones/seguridad.md#argumentos-como-array-nunca-como-línea-de-comando).
 *
 * Son puros y viven acá y no en un envoltorio tipo `simple-git` porque el valor
 * de un envoltorio es exactamente esto —armar argumentos— y como función pura
 * se testea sin lanzar un proceso, que es estrictamente mejor. Ver
 * [ADR-0019](../../../../docs/adr/0019-git-con-spawn-crudo.md).
 *
 * Todos los comandos son **porcelana estable**: git se compromete a no cambiar
 * su formato de salida, al revés que la porcelana "para humanos".
 */

/**
 * Detecta la raíz del repositorio.
 *
 * @returns Los argumentos.
 * @example
 * buildToplevelArgs(); // ['rev-parse', '--show-toplevel']
 */
export function buildToplevelArgs(): string[] {
  return ['rev-parse', '--show-toplevel'];
}

/**
 * El estado de los archivos **y** el ahead/behind, en una sola invocación.
 *
 * `--branch` es lo que hace que `# branch.ab +1 -2` venga incluido: sin él, el
 * indicador de la barra de estado costaría un `rev-list` por refresco.
 * `--untracked-files=normal` lista las carpetas sin seguimiento colapsadas en
 * vez de recorrerlas enteras, que sobre un `node_modules` recién creado es la
 * diferencia entre una línea y cuarenta mil.
 *
 * @returns Los argumentos.
 * @example
 * buildStatusArgs(); // ['status', '--porcelain=v2', '--branch', '-z', ...]
 */
export function buildStatusArgs(): string[] {
  return ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'];
}

/**
 * Prepara archivos para el commit.
 *
 * El `--` separa las rutas de las opciones: sin él, un archivo llamado
 * `--force` sería una bandera.
 *
 * @param paths Rutas relativas a la raíz del repositorio.
 * @returns Los argumentos.
 * @example
 * buildStageArgs(['src/a.ts']); // ['add', '--', 'src/a.ts']
 */
export function buildStageArgs(paths: readonly string[]): string[] {
  return ['add', '--', ...paths];
}

/**
 * Saca archivos del índice sin tocar el árbol de trabajo.
 *
 * `restore --staged` y no `reset HEAD`: el segundo falla en un repositorio sin
 * commits, que es exactamente el estado en el que alguien prepara y desprepara
 * archivos por primera vez.
 *
 * @param paths Rutas relativas a la raíz del repositorio.
 * @returns Los argumentos.
 * @example
 * buildUnstageArgs(['src/a.ts']); // ['restore', '--staged', '--', 'src/a.ts']
 */
export function buildUnstageArgs(paths: readonly string[]): string[] {
  return ['restore', '--staged', '--', ...paths];
}

/**
 * Crea un commit con lo que esté preparado.
 *
 * El mensaje es **un elemento de `argv`**, nunca interpolado en un string.
 *
 * @param message El mensaje, tal como lo escribió la persona.
 * @returns Los argumentos.
 * @example
 * buildCommitArgs('feat: x'); // ['commit', '-m', 'feat: x']
 */
export function buildCommitArgs(message: string): string[] {
  return ['commit', '-m', message];
}

/**
 * Lista las ramas locales, sólo sus nombres.
 *
 * `--format=%(refname:short)` evita tener que sacar el `* ` de la rama actual y
 * el sangrado de las demás, que es parseo de una salida pensada para leer.
 *
 * @returns Los argumentos.
 * @example
 * buildBranchListArgs(); // ['branch', '--format=%(refname:short)', '--list']
 */
export function buildBranchListArgs(): string[] {
  return ['branch', '--format=%(refname:short)', '--list'];
}

/**
 * Cambia de rama.
 *
 * El `--` está por lo mismo que en `add`: una rama llamada `-f` no puede
 * convertirse en una bandera.
 *
 * @param branch Nombre de la rama.
 * @returns Los argumentos.
 * @example
 * buildCheckoutArgs('main'); // ['checkout', '--', 'main']
 */
export function buildCheckoutArgs(branch: string): string[] {
  // El separador va **antes** del nombre y con `checkout` significa "esto es
  // una rama, no un archivo": es la forma de que `git checkout main` no sea
  // ambiguo cuando además existe un archivo llamado `main`.
  return ['checkout', branch, '--'];
}

/**
 * El diff de un archivo contra el índice, sin contexto.
 *
 * `-U0` es lo que hace que las cabeceras `@@` alcancen para las decoraciones
 * del gutter: sin contexto, cada hunk es exactamente el rango que cambió.
 * `--histogram` es el algoritmo que produce hunks más chicos y más parecidos a
 * lo que una persona diría que cambió.
 *
 * @param path Ruta relativa a la raíz del repositorio.
 * @returns Los argumentos.
 * @example
 * buildFileDiffArgs('src/a.ts');
 */
export function buildFileDiffArgs(path: string): string[] {
  return ['diff', '--no-color', '-U0', '--histogram', '--', path];
}
