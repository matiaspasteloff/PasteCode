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

  for (const listener of pendingListeners) listener(monaco);

  pendingListeners.clear();
}

/** Los que pidieron el namespace antes de que existiera. */
const pendingListeners = new Set<(monaco: typeof MonacoApi) => void>();

/**
 * Corre algo apenas Monaco esté disponible, sin provocar su carga.
 *
 * Existe porque hay trabajo que no cuelga de ningún componente del editor y sin
 * embargo necesita el namespace: el LSP se suscribe al ciclo de vida de los
 * **modelos** —`onDidCreateModel` y `onWillDisposeModel`— para saber qué
 * documento abrir y cuál cerrar. Enganchar eso al montaje del editor sería
 * atarlo a que haya una pestaña activa, que es justo lo que no vale: un modelo
 * puede crearse por una restauración de sesión antes de que nadie lo mire.
 *
 * Si Monaco ya está cargado, el listener corre en el momento.
 *
 * @param listener Qué hacer con el namespace.
 * @returns La función que cancela la espera. Idempotente.
 * @example
 * useEffect(() => whenMonacoLoaded((monaco) => subscribe(monaco)), []);
 */
export function whenMonacoLoaded(listener: (monaco: typeof MonacoApi) => void): () => void {
  if (loaded !== null) {
    listener(loaded);

    return () => undefined;
  }

  pendingListeners.add(listener);

  return () => {
    pendingListeners.delete(listener);
  };
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

/**
 * La única instancia de editor montada, o `null` si todavía no hay ninguna.
 *
 * La necesita el guardado de sesión ([RF-707](../../../../../../docs/03-requerimientos-funcionales.md#comandos-atajos-y-configuración)):
 * la posición del cursor de la pestaña **activa** sólo la sabe el editor, no
 * el registro de modelos, que guarda la de cada pestaña recién cuando se la
 * abandona.
 */
let activeEditor: MonacoApi.editor.IStandaloneCodeEditor | null = null;

/**
 * Registra o borra la instancia montada.
 *
 * @param editor La instancia, o `null` al desmontarla.
 * @example
 * setActiveEditor(monaco.editor.create(container, options));
 */
export function setActiveEditor(editor: MonacoApi.editor.IStandaloneCodeEditor | null): void {
  activeEditor = editor;
}

/**
 * La instancia montada.
 *
 * @returns El editor, o `null` si no hay ninguno.
 * @example
 * const position = getActiveEditor()?.getPosition();
 */
export function getActiveEditor(): MonacoApi.editor.IStandaloneCodeEditor | null {
  return activeEditor;
}
