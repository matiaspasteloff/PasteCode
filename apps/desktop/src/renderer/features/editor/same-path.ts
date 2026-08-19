/**
 * Si dos rutas absolutas apuntan al mismo archivo.
 *
 * **Existe por la letra de unidad.** Monaco normaliza el `fsPath` de sus
 * modelos con la unidad en minúscula —`c:\proyecto\app.js`— y el resto del
 * proyecto la conserva como vino del sistema —`C:\proyecto\app.js`—. Comparar
 * con `===` da falso entre dos rutas que son el mismo archivo, y el síntoma es
 * una decoración que nunca se dibuja sin ningún error a la vista.
 *
 * Lo encontró el E2E de breakpoints, y de paso destapó que el gutter de Git
 * hacía la misma comparación.
 *
 * La comparación es insensible a mayúsculas **entera** y no sólo en la unidad:
 * en Windows el sistema de archivos lo es, y esta función corre sólo en el
 * renderer de una app de escritorio. En un sistema sensible a mayúsculas el
 * costo sería tratar como iguales dos archivos que difieren sólo en la caja,
 * que es una situación que ningún proyecto real sostiene.
 *
 * @param left Una ruta absoluta, o `undefined`.
 * @param right La otra.
 * @returns `true` si son el mismo archivo.
 * @example
 * isSamePath('c:\p\a.ts', 'C:\p\a.ts'); // true
 */
export function isSamePath(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;

  return left.toLowerCase() === right.toLowerCase();
}
