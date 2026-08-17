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
 * Las instancias de editor montadas, una por grupo.
 *
 * Pasó de ser **una** instancia a un registro de dos **conservando la firma de
 * `getActiveEditor()`**, y eso es lo que mantiene chico el cambio de split
 * view: `use-session.ts`, `navigation.ts` y el gutter siguen preguntando "el
 * editor" y siguen recibiendo el que la persona está mirando.
 */
const editors = new Map<string, MonacoApi.editor.IStandaloneCodeEditor>();

/** Qué grupo tiene el foco. Lo mantiene sincronizado el editor al montarse. */
let focusedGroupId: string | null = null;

/**
 * Registra o borra la instancia de un grupo.
 *
 * @param groupId El grupo al que pertenece.
 * @param editor La instancia, o `null` al desmontarla.
 * @example
 * setGroupEditor('primary', monaco.editor.create(container, options));
 */
export function setGroupEditor(
  groupId: string,
  editor: MonacoApi.editor.IStandaloneCodeEditor | null
): void {
  if (editor === null) {
    editors.delete(groupId);

    if (focusedGroupId === groupId) focusedGroupId = null;

    return;
  }

  editors.set(groupId, editor);
  focusedGroupId ??= groupId;
}

/**
 * Anota qué grupo tiene el foco.
 *
 * @param groupId El grupo enfocado.
 * @example
 * setFocusedGroup('secondary');
 */
export function setFocusedGroup(groupId: string): void {
  focusedGroupId = groupId;
}

/**
 * La instancia del grupo enfocado.
 *
 * **La firma no cambió** al pasar a dos grupos, a propósito: lo que "el editor
 * activo" significa —el que la persona está mirando— es lo mismo con uno o con
 * dos paneles.
 *
 * @returns El editor, o `null` si no hay ninguno montado.
 * @example
 * const position = getActiveEditor()?.getPosition();
 */
export function getActiveEditor(): MonacoApi.editor.IStandaloneCodeEditor | null {
  if (focusedGroupId !== null) {
    const focused = editors.get(focusedGroupId);

    if (focused !== undefined) return focused;
  }

  return [...editors.values()][0] ?? null;
}
