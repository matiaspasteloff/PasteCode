/**
 * El apagado ordenado de la app, en un solo lugar.
 *
 * Antes del paso 26 esto vivía escrito a mano adentro de `main/index.ts` y
 * disponía **sólo** las terminales. El resultado es un agujero real en
 * [RNF-10](../../../../../docs/04-requerimientos-no-funcionales.md#confiabilidad)
 * que nadie notó porque casi nunca se ve: si alguien cierra PasteCode mientras
 * hay una búsqueda corriendo, el `rg` queda vivo y adoptado por el sistema.
 * ripgrep suele ganar la carrera y terminar solo, y por eso el bug es
 * invisible; sobre un repo grande, no.
 *
 * Con el LSP y el DAP encima serían tres subsistemas más con procesos hijo, así
 * que la respuesta no es acordarse de agregar una línea más al `before-quit`:
 * es que cada subsistema registre cómo se apaga y que haya un solo lugar que
 * los recorra.
 */

/**
 * La ventana de gracia, **compartida por todos**.
 *
 * Son los 3 segundos de RNF-10, una vez y no una por subsistema. Tres ventanas
 * de tres segundos en fila son nueve segundos entre el click en la X y la
 * ventana desapareciendo, que es tiempo de sobra para que Windows dibuje el
 * diálogo de "el programa no responde" encima de una app que está cerrándose
 * perfectamente bien.
 */
export const SHUTDOWN_GRACE_MS = 3000;

/** Lo que sabe apagarse. Recibe la ventana de gracia que le queda a todos. */
export type Disposer = (graceMs: number) => Promise<void> | void;

/** Nombre → disposer. El nombre es para el log cuando uno falla. */
const disposers = new Map<string, Disposer>();

/**
 * Registra cómo se apaga un subsistema.
 *
 * Registrar dos veces con el mismo nombre reemplaza: es lo que hace que
 * recargar un módulo en desarrollo no acumule disposers muertos.
 *
 * @param name Qué subsistema es. Va al log si su apagado falla.
 * @param dispose Qué hacer al cerrar.
 * @example
 * registerDisposer('search', () => { cancelSearch(); });
 */
export function registerDisposer(name: string, dispose: Disposer): void {
  disposers.set(name, dispose);
}

/**
 * Corre todos los disposers **en paralelo**, contra una única ventana.
 *
 * En paralelo y no en secuencia por la misma razón por la que el pool le pide a
 * todos sus procesos que terminen antes de esperar a ninguno: apagar cuesta el
 * máximo de las esperas, no la suma.
 *
 * Un disposer que falla no cancela a los otros. Cerrar la app es lo último que
 * pasa, así que "uno de los cinco tiró" no puede convertirse en "los otros
 * cuatro no corrieron y quedaron cuatro procesos huérfanos".
 *
 * @param graceMs Cuánto tiene cada uno. Por defecto, la ventana de RNF-10.
 * @returns Cuando todos terminaron o fallaron.
 * @example
 * await disposeAll();
 */
export async function disposeAll(graceMs: number = SHUTDOWN_GRACE_MS): Promise<void> {
  const pending = [...disposers.entries()].map(async ([name, dispose]) => {
    try {
      await dispose(graceMs);
    } catch (cause) {
      // No se relanza: ver arriba. Pero tampoco se traga en silencio, que es
      // lo que la regla 2 de codigo.md prohíbe.
      console.error(JSON.stringify({ scope: 'shutdown', event: 'failed', name }), cause);
    }
  });

  await Promise.all(pending);
}

/**
 * Olvida todos los disposers.
 *
 * Existe para los tests: el registro es un módulo con estado, y un test que
 * registra algo no puede filtrarlo al siguiente.
 *
 * @example
 * afterEach(() => { clearDisposers(); });
 */
export function clearDisposers(): void {
  disposers.clear();
}
