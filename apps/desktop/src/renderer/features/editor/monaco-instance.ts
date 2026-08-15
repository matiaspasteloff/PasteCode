import type * as MonacoApi from 'monaco-editor/editor/editor.api';

/**
 * El namespace de Monaco, una vez cargado.
 *
 * Existe para que otras partes de la UI —el tema, por ahora— puedan hablarle a
 * Monaco **sin provocar su carga**. Un `await import('./monaco-setup.js')`
 * desde el conmutador de temas traería los casi 4MB del editor al arrancar,
 * aunque no haya ningún archivo abierto, y eso rompe el presupuesto de
 * arranque de [RNF-01](../../../../../../docs/04-requerimientos-no-funcionales.md#performance).
 *
 * El tipo se importa con `import type`, que se borra en la compilación: este
 * módulo no arrastra a Monaco.
 */
let loaded: typeof MonacoApi | null = null;

/**
 * Registra el namespace apenas el editor termina de cargarlo.
 *
 * @param monaco El namespace recién importado.
 * @example
 * void import('./monaco-setup.js').then(({ monaco }) => { setLoadedMonaco(monaco); });
 */
export function setLoadedMonaco(monaco: typeof MonacoApi): void {
  loaded = monaco;
}

/**
 * El namespace, o `null` si Monaco todavía no se cargó.
 *
 * @returns El namespace cargado, o `null`.
 * @example
 * getLoadedMonaco()?.editor.setTheme('vs-dark');
 */
export function getLoadedMonaco(): typeof MonacoApi | null {
  return loaded;
}
